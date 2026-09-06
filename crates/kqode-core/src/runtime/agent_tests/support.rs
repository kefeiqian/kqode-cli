use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};

use serde_json::{Value, json};

use crate::{
    cancellation::CancellationToken,
    runtime::{
        FinishReason, ModelProvider, ModelProviderError, ModelProviderErrorKind,
        ModelProviderFuture, ModelRequest, ModelStep, RuntimeConfig, ToolExecution, TurnBudget,
        TurnBudgetOverrides, TurnRequest,
    },
    tool::{
        ToolCall, ToolCallError, ToolDefinition, ToolEffects, ToolErrorKind, ToolExecutionMode,
        ToolExposure, ToolExposureSnapshot, ToolHandler, ToolHandlerFuture, ToolInvocation,
        ToolLimits, ToolRegistry, ToolResult, ToolSource,
    },
};

pub(super) struct FakeProvider {
    steps: Mutex<VecDeque<Result<ModelStep, ModelProviderError>>>,
    requests: Mutex<Vec<ModelRequest>>,
}

impl FakeProvider {
    pub(super) fn new(steps: Vec<ModelStep>) -> Arc<Self> {
        Arc::new(Self {
            steps: Mutex::new(steps.into_iter().map(Ok).collect()),
            requests: Mutex::new(Vec::new()),
        })
    }

    pub(super) fn requests(&self) -> Vec<ModelRequest> {
        self.requests.lock().unwrap().clone()
    }
}

impl ModelProvider for FakeProvider {
    fn request<'a>(
        &'a self,
        request: ModelRequest,
        _cancellation: CancellationToken,
    ) -> ModelProviderFuture<'a> {
        self.requests.lock().unwrap().push(request);
        Box::pin(async move {
            self.steps.lock().unwrap().pop_front().unwrap_or_else(|| {
                Err(ModelProviderError::new(
                    ModelProviderErrorKind::Response,
                    "fake provider has no remaining steps",
                ))
            })
        })
    }
}

pub(super) struct PendingProvider;

impl ModelProvider for PendingProvider {
    fn request<'a>(
        &'a self,
        _request: ModelRequest,
        _cancellation: CancellationToken,
    ) -> ModelProviderFuture<'a> {
        Box::pin(std::future::pending())
    }
}

#[derive(Clone, Copy)]
pub(super) enum HandlerBehavior {
    Echo,
    Cancel,
    DelayPastBudget,
    DelayPastBudgetAndStop,
    Mismatch,
    Never,
    Panic,
    Stop,
}

struct TestHandler(HandlerBehavior);

impl ToolHandler for TestHandler {
    fn invoke<'a>(
        &'a self,
        invocation: &'a ToolInvocation,
        cancellation: &'a CancellationToken,
    ) -> ToolHandlerFuture<'a> {
        Box::pin(async move {
            let normalized_call = call(
                &invocation.call_id,
                &invocation.canonical_name,
                invocation.arguments.clone(),
            );
            match self.0 {
                HandlerBehavior::Echo => {
                    ToolResult::success(&normalized_call, "echoed", invocation.arguments.clone())
                }
                HandlerBehavior::Cancel => {
                    cancellation.cancel();
                    ToolResult::failure(
                        &normalized_call,
                        ToolCallError {
                            kind: ToolErrorKind::Cancelled,
                            message: "cancelled by test handler".to_owned(),
                        },
                    )
                }
                HandlerBehavior::DelayPastBudget => {
                    std::thread::sleep(Duration::from_millis(1_100));
                    ToolResult::success(&normalized_call, "delayed", json!({}))
                }
                HandlerBehavior::DelayPastBudgetAndStop => {
                    std::thread::sleep(Duration::from_millis(1_100));
                    let mut result =
                        ToolResult::success(&normalized_call, "delayed stop", json!({}));
                    result.should_continue = false;
                    result
                }
                HandlerBehavior::Mismatch => ToolResult::success(
                    &call("wrong-id", "wrong-tool", json!({})),
                    "invalid result",
                    json!({}),
                ),
                HandlerBehavior::Never => std::future::pending().await,
                HandlerBehavior::Panic => panic!("handler must not be dispatched"),
                HandlerBehavior::Stop => {
                    let mut result =
                        ToolResult::success(&normalized_call, "stop requested", json!({}));
                    result.should_continue = false;
                    result
                }
            }
        })
    }
}

pub(super) fn snapshot(tools: &[(&str, ToolExposure, HandlerBehavior)]) -> ToolExposureSnapshot {
    let mut registry = ToolRegistry::new();
    for (name, exposure, behavior) in tools {
        registry
            .register(
                definition(name, *exposure),
                Arc::new(TestHandler(*behavior)),
            )
            .unwrap();
    }
    registry.snapshot()
}

pub(super) fn enabled_config(overrides: TurnBudgetOverrides) -> RuntimeConfig {
    RuntimeConfig {
        budget: TurnBudget::with_overrides(overrides),
        tool_execution: ToolExecution::Enabled,
    }
}

pub(super) fn turn_request() -> TurnRequest {
    TurnRequest {
        session_id: "session-1".to_owned(),
        turn_id: "turn-1".to_owned(),
        content: "inspect the workspace".to_owned(),
    }
}

pub(super) fn call(id: &str, name: &str, arguments: Value) -> ToolCall {
    ToolCall {
        id: id.to_owned(),
        canonical_name: name.to_owned(),
        arguments,
        argument_error: None,
    }
}

pub(super) fn tool_step(calls: Vec<ToolCall>) -> ModelStep {
    ModelStep {
        assistant_content: None,
        tool_calls: calls,
        finish_reason: FinishReason::ToolCalls,
        usage: None,
        provider_metadata: None,
    }
}

pub(super) fn text_step(content: &str) -> ModelStep {
    ModelStep {
        assistant_content: Some(content.to_owned()),
        tool_calls: Vec::new(),
        finish_reason: FinishReason::Stop,
        usage: None,
        provider_metadata: None,
    }
}

pub(super) fn empty_step() -> ModelStep {
    ModelStep {
        assistant_content: None,
        tool_calls: Vec::new(),
        finish_reason: FinishReason::Stop,
        usage: None,
        provider_metadata: None,
    }
}

fn definition(name: &str, exposure: ToolExposure) -> ToolDefinition {
    ToolDefinition {
        canonical_name: name.to_owned(),
        display_name: name.to_owned(),
        description: format!("Test tool {name}"),
        input_schema: json!({
            "type": "object",
            "properties": { "value": { "type": "string" } },
            "required": ["value"],
            "additionalProperties": false
        }),
        effects: ToolEffects::default(),
        exposure,
        execution_mode: ToolExecutionMode::Sequential,
        limits: ToolLimits::default(),
        source: ToolSource::Builtin,
    }
}
