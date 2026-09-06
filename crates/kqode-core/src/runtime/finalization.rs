use super::state::RunState;
use super::{
    AgentRuntime, RuntimeEvent, StopReason, TurnOutcome, TurnReport, TurnRequest, TurnStatus,
};

pub(super) fn finish(
    runtime: &AgentRuntime,
    request: &TurnRequest,
    state: RunState,
    mut outcome: TurnOutcome,
) -> TurnReport {
    if !state.ledger.all_terminal() {
        outcome = failed(StopReason::Protocol(
            "runtime stopped with unsettled tool calls".to_owned(),
        ));
    }
    runtime.events.emit(RuntimeEvent::TurnFinished {
        session_id: request.session_id.clone(),
        turn_id: request.turn_id.clone(),
        outcome: outcome.clone(),
    });
    TurnReport {
        outcome,
        ledger: state.ledger.entries(),
        budget: state.budget,
    }
}

pub(super) fn cancelled() -> TurnOutcome {
    TurnOutcome {
        status: TurnStatus::Cancelled,
        stop_reason: StopReason::CancelledByUser,
        final_message: None,
    }
}

pub(super) fn budget_outcome(message: String) -> TurnOutcome {
    TurnOutcome {
        status: TurnStatus::BudgetExceeded,
        stop_reason: StopReason::Budget(message),
        final_message: None,
    }
}

pub(super) fn failed(reason: StopReason) -> TurnOutcome {
    TurnOutcome {
        status: TurnStatus::Failed,
        stop_reason: reason,
        final_message: None,
    }
}
