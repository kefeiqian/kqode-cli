//! Decides the auto-compaction split: which older rounds fold into the summary
//! and where the new verbatim boundary sits.
//!
//! Pure logic, no network. The trigger decision (is the assembled request over
//! the budget threshold?) is made by the caller with [`super::token_estimate`]
//! and [`super::context_budget`]; this module decides the split once compaction
//! is warranted, and only ever folds in rounds not already covered by the
//! current summary (so already-compacted history is never re-summarized).

use crate::chat::request::{CompactionState, HistoryRound};
use crate::chat::token_estimate::estimate_round;

/// Fraction of the budget kept as a verbatim tail of the most recent rounds.
const VERBATIM_TAIL_RATIO: f64 = 0.30;

/// A decided compaction: the rounds to fold into the (anchored) summary and the
/// new boundary. Rounds with `seq <= new_covered_through_seq` become covered.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompactionPlan {
    /// New inclusive boundary: rounds up to this seq are represented by the summary.
    pub new_covered_through_seq: u64,
    /// The newly-uncovered rounds to summarize this pass (ascending seq).
    pub head: Vec<HistoryRound>,
}

/// Verbatim-tail token budget derived from the context budget.
#[must_use]
pub fn tail_budget_tokens(budget: usize) -> usize {
    ((budget as f64) * VERBATIM_TAIL_RATIO) as usize
}

/// Decides the compaction split for `history` given the current `compaction`
/// state and the context `budget`. Only rounds not already covered by the
/// summary are considered; the newest ones that fit the verbatim-tail budget
/// stay verbatim and the rest become the head to summarize.
///
/// Returns `None` when there is nothing new to fold in (0-1 uncovered rounds, or
/// all uncovered rounds fit the verbatim tail) — the caller then relies on the
/// post-compaction budget re-check to surface an over-budget request.
#[must_use]
pub fn plan(
    history: &[HistoryRound],
    compaction: &CompactionState,
    budget: usize,
) -> Option<CompactionPlan> {
    let uncovered: Vec<HistoryRound> = history
        .iter()
        .filter(|round| !compaction.covers(round.seq))
        .cloned()
        .collect();
    plan_over_uncovered(&uncovered, tail_budget_tokens(budget))
}

/// Keeps the newest rounds that fit `tail_budget` verbatim (always at least the
/// single newest round) and returns the older remainder as the head to
/// summarize. `None` when the head would be empty.
fn plan_over_uncovered(uncovered: &[HistoryRound], tail_budget: usize) -> Option<CompactionPlan> {
    let mut tail_tokens = 0usize;
    let mut head_end = uncovered.len();
    for (index, round) in uncovered.iter().enumerate().rev() {
        let round_tokens = estimate_round(round);
        let is_newest = index == uncovered.len() - 1;
        if !is_newest && tail_tokens + round_tokens > tail_budget {
            break;
        }
        tail_tokens += round_tokens;
        head_end = index;
    }
    let head = &uncovered[..head_end];
    let new_covered_through_seq = head.last()?.seq;
    Some(CompactionPlan {
        new_covered_through_seq,
        head: head.to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round(seq: u64, size: usize) -> HistoryRound {
        HistoryRound::new(seq, "u".repeat(size), "a".repeat(size))
    }

    #[test]
    fn no_plan_when_everything_fits_the_tail() {
        let history = vec![round(0, 10), round(1, 10), round(2, 10)];
        assert!(plan(&history, &CompactionState::default(), 1_000_000).is_none());
    }

    #[test]
    fn no_plan_for_a_single_round() {
        let history = vec![round(0, 10_000)];
        assert!(plan(&history, &CompactionState::default(), 1_000).is_none());
    }

    #[test]
    fn folds_older_rounds_and_keeps_the_newest_verbatim() {
        // Each round ~ (2 * 400) / 4 + overhead ≈ 208 tokens; tail budget = 300.
        let history = vec![round(0, 400), round(1, 400), round(2, 400), round(3, 400)];
        let plan = plan(&history, &CompactionState::default(), 1_000).expect("plan");
        assert!(!plan.head.is_empty());
        assert_eq!(plan.new_covered_through_seq, plan.head.last().unwrap().seq);
        // The newest round is always kept verbatim, never in the head.
        assert!(plan.head.iter().all(|round| round.seq < 3));
    }

    #[test]
    fn only_folds_uncovered_rounds() {
        let history = vec![round(0, 400), round(1, 400), round(2, 400), round(3, 400)];
        let compaction = CompactionState {
            summary: Some("prior".to_owned()),
            covered_through_seq: 1,
        };
        if let Some(plan) = plan(&history, &compaction, 1_000) {
            // Already-covered rounds (seq <= 1) must never re-enter the head.
            assert!(plan.head.iter().all(|round| round.seq > 1));
        }
    }
}
