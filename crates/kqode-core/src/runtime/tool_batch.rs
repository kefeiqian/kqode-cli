use std::time::Instant;

use crate::{
    cancellation::CancellationToken,
    tool::{
        LedgerError, ToolCall, ToolCallError, ToolCallLedger, ToolCallState, ToolErrorKind,
        ToolExposureSnapshot, ToolInvocation, ToolResult,
    },
};

use super::{RuntimeEvent, RuntimeEventSink, TurnBudget};

pub(super) struct ToolBatchExecutor<'a> {
    pub session_id: &'a str,
    pub turn_id: &'a str,
    pub step_id: &'a str,
    pub tools: &'a ToolExposureSnapshot,
    pub events: &'a dyn RuntimeEventSink,
    pub budget: TurnBudget,
    pub started_at: Instant,
}

pub(super) struct ToolBatchResult {
    pub results: Vec<ToolResult>,
    pub requested_stop: Option<String>,
    pub budget_exceeded: Option<String>,
}

impl ToolBatchExecutor<'_> {
    pub(super) async fn execute(
        &self,
        calls: &[ToolCall],
        ledger: &mut ToolCallLedger,
        cancellation: &CancellationToken,
    ) -> Result<ToolBatchResult, LedgerError> {
        let mut results = Vec::with_capacity(calls.len());
        for (index, call) in calls.iter().enumerate() {
            self.emit_state(call, ToolCallState::Received);
            if cancellation.is_cancelled() {
                self.emit_received(&calls[index + 1..]);
                results.extend(self.skip_calls(
                    &calls[index..],
                    ledger,
                    ToolErrorKind::Cancelled,
                    "Tool call skipped because the turn was cancelled",
                )?);
                return Ok(ToolBatchResult {
                    results,
                    requested_stop: None,
                    budget_exceeded: None,
                });
            }
            if let Err(error) = self.budget.check_elapsed(self.started_at.elapsed()) {
                self.emit_received(&calls[index + 1..]);
                results.extend(self.skip_calls(
                    &calls[index..],
                    ledger,
                    ToolErrorKind::BudgetExceeded,
                    &error.message,
                )?);
                return Ok(ToolBatchResult {
                    results,
                    requested_stop: None,
                    budget_exceeded: Some(error.message),
                });
            }

            let result = match self.tools.validate_call(call) {
                Ok(()) => self.dispatch(call, ledger, cancellation).await?,
                Err(error) => self.fail_validation(call, ledger, error)?,
            };
            let should_continue = result.should_continue;
            let stop_summary = result.summary.clone();
            self.emit_result(result.clone());
            results.push(result);

            if results
                .last()
                .is_some_and(|result| result.error_kind == Some(ToolErrorKind::BudgetExceeded))
            {
                self.emit_received(&calls[index + 1..]);
                results.extend(self.skip_calls(
                    &calls[index + 1..],
                    ledger,
                    ToolErrorKind::BudgetExceeded,
                    "elapsed time budget exceeded",
                )?);
                return Ok(ToolBatchResult {
                    results,
                    requested_stop: None,
                    budget_exceeded: Some("elapsed time budget exceeded".to_owned()),
                });
            }
            if cancellation.is_cancelled() {
                self.emit_received(&calls[index + 1..]);
                results.extend(self.skip_calls(
                    &calls[index + 1..],
                    ledger,
                    ToolErrorKind::Cancelled,
                    "Tool call skipped because the turn was cancelled",
                )?);
                return Ok(ToolBatchResult {
                    results,
                    requested_stop: None,
                    budget_exceeded: None,
                });
            }
            if let Err(error) = self.budget.check_elapsed(self.started_at.elapsed()) {
                self.emit_received(&calls[index + 1..]);
                results.extend(self.skip_calls(
                    &calls[index + 1..],
                    ledger,
                    ToolErrorKind::BudgetExceeded,
                    &error.message,
                )?);
                return Ok(ToolBatchResult {
                    results,
                    requested_stop: None,
                    budget_exceeded: Some(error.message),
                });
            }
            if !should_continue {
                self.emit_received(&calls[index + 1..]);
                results.extend(self.skip_calls(
                    &calls[index + 1..],
                    ledger,
                    ToolErrorKind::Unavailable,
                    "Tool call skipped because a previous result stopped the loop",
                )?);
                return Ok(ToolBatchResult {
                    results,
                    requested_stop: Some(stop_summary),
                    budget_exceeded: None,
                });
            }
        }
        Ok(ToolBatchResult {
            results,
            requested_stop: None,
            budget_exceeded: None,
        })
    }

    pub(super) fn skip_all(
        &self,
        calls: &[ToolCall],
        ledger: &mut ToolCallLedger,
        kind: ToolErrorKind,
        message: &str,
    ) -> Result<Vec<ToolResult>, LedgerError> {
        self.emit_received(calls);
        self.skip_calls(calls, ledger, kind, message)
    }

    async fn dispatch(
        &self,
        call: &ToolCall,
        ledger: &mut ToolCallLedger,
        cancellation: &CancellationToken,
    ) -> Result<ToolResult, LedgerError> {
        self.transition(call, ledger, ToolCallState::Validated)?;
        if cancellation.is_cancelled() {
            self.transition(call, ledger, ToolCallState::Skipped)?;
            return Ok(skipped_result(
                call,
                ToolErrorKind::Cancelled,
                "Tool call skipped because the turn was cancelled",
            ));
        }
        self.transition(call, ledger, ToolCallState::Running)?;
        let invocation = ToolInvocation {
            call_id: call.id.clone(),
            canonical_name: call.canonical_name.clone(),
            arguments: call.arguments.clone(),
            session_id: self.session_id.to_owned(),
            turn_id: self.turn_id.to_owned(),
            step_id: self.step_id.to_owned(),
        };
        let invocation_future = self.tools.invoke(&invocation, cancellation);
        let result = match self.budget.remaining_elapsed(self.started_at.elapsed()) {
            Ok(Some(remaining)) => match tokio::time::timeout(remaining, invocation_future).await {
                Ok(result) => normalize_result(call, result),
                Err(_) => skipped_result(
                    call,
                    ToolErrorKind::BudgetExceeded,
                    "elapsed time budget exceeded",
                ),
            },
            Ok(None) => normalize_result(call, invocation_future.await),
            Err(error) => skipped_result(call, ToolErrorKind::BudgetExceeded, &error.message),
        };
        let state = match result.error_kind {
            Some(ToolErrorKind::Cancelled) => ToolCallState::Cancelled,
            Some(_) => ToolCallState::Failed,
            None if result.success => ToolCallState::Succeeded,
            None => ToolCallState::Failed,
        };
        self.transition(call, ledger, state)?;
        Ok(result)
    }

    fn fail_validation(
        &self,
        call: &ToolCall,
        ledger: &mut ToolCallLedger,
        error: ToolCallError,
    ) -> Result<ToolResult, LedgerError> {
        self.transition(call, ledger, ToolCallState::Failed)?;
        Ok(ToolResult::failure(call, error))
    }

    fn skip_calls(
        &self,
        calls: &[ToolCall],
        ledger: &mut ToolCallLedger,
        kind: ToolErrorKind,
        message: &str,
    ) -> Result<Vec<ToolResult>, LedgerError> {
        calls
            .iter()
            .map(|call| {
                self.transition(call, ledger, ToolCallState::Skipped)?;
                let result = skipped_result(call, kind, message);
                self.emit_result(result.clone());
                Ok(result)
            })
            .collect()
    }

    fn transition(
        &self,
        call: &ToolCall,
        ledger: &mut ToolCallLedger,
        state: ToolCallState,
    ) -> Result<(), LedgerError> {
        ledger.transition(&call.id, &call.canonical_name, state)?;
        self.emit_state(call, state);
        Ok(())
    }

    fn emit_received(&self, calls: &[ToolCall]) {
        calls
            .iter()
            .for_each(|call| self.emit_state(call, ToolCallState::Received));
    }

    fn emit_state(&self, call: &ToolCall, state: ToolCallState) {
        self.events.emit(RuntimeEvent::ToolCallStateChanged {
            session_id: self.session_id.to_owned(),
            turn_id: self.turn_id.to_owned(),
            step_id: self.step_id.to_owned(),
            call_id: call.id.clone(),
            canonical_name: call.canonical_name.clone(),
            state,
        });
    }

    fn emit_result(&self, result: ToolResult) {
        self.events.emit(RuntimeEvent::ToolResultProduced {
            session_id: self.session_id.to_owned(),
            turn_id: self.turn_id.to_owned(),
            step_id: self.step_id.to_owned(),
            result,
        });
    }
}

fn skipped_result(call: &ToolCall, kind: ToolErrorKind, message: &str) -> ToolResult {
    ToolResult::failure(
        call,
        ToolCallError {
            kind,
            message: message.to_owned(),
        },
    )
}

fn normalize_result(call: &ToolCall, result: ToolResult) -> ToolResult {
    let correlation_matches =
        result.call_id == call.id && result.canonical_name == call.canonical_name;
    let status_matches = result.success == result.error_kind.is_none();
    if correlation_matches && status_matches {
        result
    } else {
        ToolResult::failure(
            call,
            ToolCallError {
                kind: ToolErrorKind::ExecutionFailed,
                message: "Tool handler returned an invalid result envelope".to_owned(),
            },
        )
    }
}
