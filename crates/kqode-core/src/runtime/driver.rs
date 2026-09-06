use crate::cancellation::CancellationToken;

use super::tool_batch::ToolBatchExecutor;
use super::{
    AgentRuntime, ModelMessage, RuntimeEvent, RuntimeNoticeKind, StopReason, ToolExecution,
    TurnOutcome, TurnReport, TurnRequest, TurnStatus,
    finalization::{budget_outcome, cancelled, failed, finish},
    preflight::{PreflightDecision, enter_text_only, prepare},
    state::RunState,
};

pub(super) async fn run(
    runtime: &AgentRuntime,
    request: TurnRequest,
    cancellation: CancellationToken,
) -> TurnReport {
    let mut state = RunState::new(&request);
    loop {
        if cancellation.is_cancelled() {
            return finish(runtime, &request, state, cancelled());
        }
        if let Err(error) = runtime
            .config
            .budget
            .check_elapsed(state.started_at.elapsed())
        {
            return finish(runtime, &request, state, budget_outcome(error.message));
        }
        if let Err(error) = state.budget.reserve_model_request(runtime.config.budget) {
            return finish(runtime, &request, state, budget_outcome(error.message));
        }

        let step_id = format!("step-{}", state.budget.model_requests);
        let model_request =
            runtime.model_request(&request, &state.messages, state.text_only, &step_id);
        let provider_request = runtime
            .provider
            .request(model_request, cancellation.clone());
        let provider_result = match runtime
            .config
            .budget
            .remaining_elapsed(state.started_at.elapsed())
        {
            Ok(Some(remaining)) => match tokio::time::timeout(remaining, provider_request).await {
                Ok(result) => result,
                Err(_) => {
                    return finish(
                        runtime,
                        &request,
                        state,
                        budget_outcome("elapsed time budget exceeded".to_owned()),
                    );
                }
            },
            Ok(None) => provider_request.await,
            Err(error) => {
                return finish(runtime, &request, state, budget_outcome(error.message));
            }
        };
        let step = match provider_result {
            Ok(step) => step,
            Err(_) if cancellation.is_cancelled() => {
                return finish(runtime, &request, state, cancelled());
            }
            Err(error) => {
                return finish(
                    runtime,
                    &request,
                    state,
                    failed(StopReason::Provider(error.message)),
                );
            }
        };
        if cancellation.is_cancelled() {
            return finish(runtime, &request, state, cancelled());
        }
        if let Err(error) = runtime
            .config
            .budget
            .check_elapsed(state.started_at.elapsed())
        {
            return finish(runtime, &request, state, budget_outcome(error.message));
        }
        runtime.events.emit(RuntimeEvent::ModelStepReceived {
            session_id: request.session_id.clone(),
            turn_id: request.turn_id.clone(),
            step_id: step_id.clone(),
            step: step.clone(),
        });
        state
            .messages
            .push(ModelMessage::Assistant { step: step.clone() });

        if step.tool_calls.is_empty() {
            if let Some(message) = visible_text(step.assistant_content.as_deref()) {
                return finish(runtime, &request, state, TurnOutcome::completed(message));
            }
            if state.after_tool && !state.text_only && !state.empty_nudge_used {
                state.empty_nudge_used = true;
                state.text_only = true;
                state.messages.push(ModelMessage::RuntimeNotice {
                    kind: RuntimeNoticeKind::EmptyResponseNudge,
                    content: "Provide a final user-visible answer without calling tools."
                        .to_owned(),
                });
                continue;
            }
            return finish(
                runtime,
                &request,
                state,
                failed(StopReason::Protocol(
                    "model returned no tool calls and no user-visible text".to_owned(),
                )),
            );
        }

        if state.text_only {
            return finish(
                runtime,
                &request,
                state,
                failed(StopReason::Protocol(
                    "model requested tools during text-only finalization".to_owned(),
                )),
            );
        }
        if runtime.config.tool_execution == ToolExecution::Disabled {
            return finish(
                runtime,
                &request,
                state,
                failed(StopReason::Protocol(
                    "model requested tools while tool execution was disabled".to_owned(),
                )),
            );
        }
        if let Err(error) = state.ledger.receive_batch(&step.tool_calls) {
            return finish(
                runtime,
                &request,
                state,
                failed(StopReason::Protocol(error.message)),
            );
        }

        let executor = ToolBatchExecutor {
            session_id: &request.session_id,
            turn_id: &request.turn_id,
            step_id: &step_id,
            tools: &runtime.tools,
            events: runtime.events.as_ref(),
            budget: runtime.config.budget,
            started_at: state.started_at,
        };
        match prepare(
            &mut state,
            &step.tool_calls,
            runtime.config.budget,
            &executor,
        ) {
            Ok(PreflightDecision::Execute) => {}
            Ok(PreflightDecision::Continue) => continue,
            Ok(PreflightDecision::Stop(outcome)) => {
                return finish(runtime, &request, state, outcome);
            }
            Err(error) => {
                return finish(
                    runtime,
                    &request,
                    state,
                    failed(StopReason::Protocol(error.message)),
                );
            }
        }

        let batch = match executor
            .execute(&step.tool_calls, &mut state.ledger, &cancellation)
            .await
        {
            Ok(batch) => batch,
            Err(error) => {
                return finish(
                    runtime,
                    &request,
                    state,
                    failed(StopReason::Protocol(error.message)),
                );
            }
        };
        state.messages.push(ModelMessage::ToolResults {
            results: batch.results,
        });
        state.after_tool = true;

        if cancellation.is_cancelled() {
            return finish(runtime, &request, state, cancelled());
        }
        if let Some(message) = batch.budget_exceeded {
            return finish(runtime, &request, state, budget_outcome(message));
        }
        if let Some(summary) = batch.requested_stop {
            return finish(
                runtime,
                &request,
                state,
                TurnOutcome {
                    status: TurnStatus::Blocked,
                    stop_reason: StopReason::ToolRequestedStop(summary),
                    final_message: None,
                },
            );
        }
        if state.budget.tool_rounds >= runtime.config.budget.max_tool_rounds()
            || state.budget.total_tool_calls >= runtime.config.budget.max_total_tool_calls()
        {
            enter_text_only(
                &mut state,
                "Tool budget exhausted; provide the final answer.",
            );
        }
    }
}

fn visible_text(content: Option<&str>) -> Option<String> {
    content
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(str::to_owned)
}
