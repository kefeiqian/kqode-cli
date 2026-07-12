//! Worker-internal compaction orchestration.
//!
//! [`run_compaction`] runs the pre-send sequence for one turn: assemble →
//! estimate → (summarize the oldest rounds if over the trigger) → re-assemble →
//! re-estimate. It runs entirely on the turn worker under the turn's single
//! [`CancellationToken`], so cancel/failure funnel through the existing settle
//! path with no second worker and no fresh token (see the plan's Alternatives
//! Considered). The summarizer is injected so the decision logic — including the
//! over-budget (R16), summarize-error (R11), and cancel (R13) branches — is unit
//! tested without a real provider.

use std::future::Future;

use crate::chat::compaction_plan;
use crate::chat::request::{CompactionState, HistoryRound, assemble};
use crate::chat::token_estimate::estimate_tokens;
use crate::chat::types::CancellationToken;
use crate::provider::{ChatMessage, ProviderError};

/// Token limits for one turn's compaction decision.
#[derive(Clone, Copy, Debug)]
pub struct ContextLimits {
    /// Estimate at or above which compaction is triggered.
    pub threshold: usize,
    /// Hard budget the final assembled request must fit within.
    pub budget: usize,
}

/// Outcome of the compaction step, consumed by the turn worker.
pub enum CompactionResult {
    /// Proceed to the main call with `messages`. `new_state` is `Some` when a
    /// fresh summary was produced (to adopt on a clean settle), else `None`.
    Ready {
        messages: Vec<ChatMessage>,
        new_state: Option<CompactionState>,
    },
    /// Cancelled before or during summarization (R13).
    Cancelled,
    /// The summarization call failed (R11).
    Error(ProviderError),
    /// Still over budget after compaction, or nothing left to fold (R16).
    OverBudget,
}

/// Runs the compaction pre-step for one turn. `summarize` is called at most once
/// with the prior summary and the head rounds to fold in. `instructions`, when
/// present, is the user-role AGENTS.md fragment; it is forwarded to both
/// [`assemble`] calls so it participates in the token estimate as well as the
/// final request.
#[allow(clippy::too_many_arguments)]
pub async fn run_compaction<S, Fut>(
    system: ChatMessage,
    instructions: Option<ChatMessage>,
    history: &[HistoryRound],
    compaction: &CompactionState,
    prompt: &str,
    limits: ContextLimits,
    cancel: &CancellationToken,
    summarize: S,
) -> CompactionResult
where
    S: FnOnce(Option<String>, Vec<HistoryRound>) -> Fut,
    Fut: Future<Output = Result<String, ProviderError>>,
{
    let messages = assemble(
        system.clone(),
        instructions.clone(),
        history,
        compaction,
        prompt,
    );
    if estimate_tokens(&messages) <= limits.threshold {
        return CompactionResult::Ready {
            messages,
            new_state: None,
        };
    }
    if cancel.is_cancelled() {
        return CompactionResult::Cancelled;
    }

    let Some(plan) = compaction_plan::plan(history, compaction, limits.budget) else {
        // Over the trigger but nothing older than the verbatim tail to fold.
        return CompactionResult::OverBudget;
    };

    let summary = tokio::select! {
        biased;
        () = cancel.cancelled() => return CompactionResult::Cancelled,
        result = summarize(compaction.summary.clone(), plan.head) => match result {
            Ok(summary) => summary,
            Err(error) => return CompactionResult::Error(error),
        }
    };

    let new_state = CompactionState {
        summary: Some(summary),
        covered_through_seq: plan.new_covered_through_seq,
    };
    let messages = assemble(system, instructions, history, &new_state, prompt);
    if estimate_tokens(&messages) > limits.budget {
        // The verbatim tail + new prompt alone still overflow — fail cleanly
        // rather than dispatching a doomed call.
        return CompactionResult::OverBudget;
    }

    CompactionResult::Ready {
        messages,
        new_state: Some(new_state),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn system() -> ChatMessage {
        ChatMessage::system("SYS")
    }

    fn round(seq: u64, size: usize) -> HistoryRound {
        HistoryRound::new(seq, "u".repeat(size), "a".repeat(size))
    }

    async fn ok_summary(
        _prior: Option<String>,
        _head: Vec<HistoryRound>,
    ) -> Result<String, ProviderError> {
        Ok("SUMMARY".to_owned())
    }

    async fn boom(
        _prior: Option<String>,
        _head: Vec<HistoryRound>,
    ) -> Result<String, ProviderError> {
        Err(ProviderError::Network("boom".to_owned()))
    }

    #[tokio::test]
    async fn ready_without_compaction_when_under_threshold() {
        let history = vec![round(0, 10), round(1, 10)];
        let result = run_compaction(
            system(),
            None,
            &history,
            &CompactionState::default(),
            "hi",
            ContextLimits {
                threshold: 100_000,
                budget: 200_000,
            },
            &CancellationToken::new(),
            // Panics if called — proves the summarizer is skipped under threshold.
            |_, _| async { panic!("summarizer must not run under threshold") },
        )
        .await;
        match result {
            CompactionResult::Ready { new_state, .. } => assert!(new_state.is_none()),
            _ => panic!("expected Ready without compaction"),
        }
    }

    #[tokio::test]
    async fn compacts_when_over_threshold() {
        // Rounds ~ (2*200)/4 + overhead ≈ 108 tokens each; threshold 200 forces compaction.
        let history = vec![round(0, 200), round(1, 200), round(2, 200), round(3, 200)];
        let result = run_compaction(
            system(),
            None,
            &history,
            &CompactionState::default(),
            "next",
            ContextLimits {
                threshold: 200,
                budget: 500,
            },
            &CancellationToken::new(),
            ok_summary,
        )
        .await;
        match result {
            CompactionResult::Ready {
                messages,
                new_state,
            } => {
                let state = new_state.expect("compaction produced a summary");
                assert_eq!(state.summary.as_deref(), Some("SUMMARY"));
                assert!(messages.iter().any(|m| m.content.contains("SUMMARY")));
            }
            _ => panic!("expected Ready with a summary"),
        }
    }

    #[tokio::test]
    async fn summarizer_error_propagates() {
        let history = vec![round(0, 200), round(1, 200), round(2, 200)];
        let result = run_compaction(
            system(),
            None,
            &history,
            &CompactionState::default(),
            "next",
            ContextLimits {
                threshold: 100,
                budget: 300,
            },
            &CancellationToken::new(),
            boom,
        )
        .await;
        assert!(matches!(result, CompactionResult::Error(_)));
    }

    #[tokio::test]
    async fn over_budget_when_still_too_large_after_compaction() {
        // A single huge round: nothing older than the verbatim tail to fold.
        let history = vec![round(0, 4_000)];
        let result = run_compaction(
            system(),
            None,
            &history,
            &CompactionState::default(),
            "next",
            ContextLimits {
                threshold: 100,
                budget: 200,
            },
            &CancellationToken::new(),
            ok_summary,
        )
        .await;
        assert!(matches!(result, CompactionResult::OverBudget));
    }

    #[tokio::test]
    async fn cancelled_before_summarizing() {
        let history = vec![round(0, 200), round(1, 200), round(2, 200)];
        let cancel = CancellationToken::new();
        cancel.cancel();
        let result = run_compaction(
            system(),
            None,
            &history,
            &CompactionState::default(),
            "next",
            ContextLimits {
                threshold: 100,
                budget: 100_000,
            },
            &cancel,
            |_, _| async { panic!("summarizer must not run after cancel") },
        )
        .await;
        assert!(matches!(result, CompactionResult::Cancelled));
    }
}
