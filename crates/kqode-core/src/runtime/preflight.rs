use crate::tool::{LedgerError, ToolCall, ToolErrorKind};

use super::{
    BudgetErrorKind, ModelMessage, RepeatAction, RuntimeNoticeKind, TurnBudget, TurnOutcome,
    finalization::budget_outcome,
};
use super::{state::RunState, tool_batch::ToolBatchExecutor};

pub(super) enum PreflightDecision {
    Execute,
    Continue,
    Stop(TurnOutcome),
}

pub(super) fn prepare(
    state: &mut RunState,
    calls: &[ToolCall],
    budget: TurnBudget,
    executor: &ToolBatchExecutor<'_>,
) -> Result<PreflightDecision, LedgerError> {
    if let Err(error) = state.budget.reserve_tool_batch(budget, calls.len()) {
        let results = executor.skip_all(
            calls,
            &mut state.ledger,
            ToolErrorKind::BudgetExceeded,
            &error.message,
        )?;
        state.messages.push(ModelMessage::ToolResults { results });
        return if error.kind == BudgetErrorKind::CallsPerRound {
            Ok(PreflightDecision::Stop(budget_outcome(error.message)))
        } else {
            enter_text_only(state, &error.message);
            Ok(PreflightDecision::Continue)
        };
    }

    let (repetition, action) = state.repetition.preview_batch(calls, budget);
    state.repetition = repetition;
    match action {
        RepeatAction::Continue => Ok(PreflightDecision::Execute),
        RepeatAction::Warn => {
            state.messages.push(ModelMessage::RuntimeNotice {
                kind: RuntimeNoticeKind::RepetitionWarning,
                content: "You are repeating the same tool call; reconsider your approach."
                    .to_owned(),
            });
            Ok(PreflightDecision::Execute)
        }
        RepeatAction::Finalize => {
            let results = executor.skip_all(
                calls,
                &mut state.ledger,
                ToolErrorKind::RepeatedCall,
                "Repeated tool call skipped; provide the final answer",
            )?;
            state.messages.push(ModelMessage::ToolResults { results });
            enter_text_only(
                state,
                "Repeated tool calls were stopped; provide the final answer.",
            );
            Ok(PreflightDecision::Continue)
        }
    }
}

pub(super) fn enter_text_only(state: &mut RunState, content: &str) {
    state.text_only = true;
    state.messages.push(ModelMessage::RuntimeNotice {
        kind: RuntimeNoticeKind::TextOnlyFinalization,
        content: content.to_owned(),
    });
}
