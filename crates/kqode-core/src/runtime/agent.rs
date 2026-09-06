use std::sync::Arc;

use crate::{cancellation::CancellationToken, tool::ToolExposureSnapshot};

use super::{
    ModelMessage, ModelProvider, ModelRequest, NoopEventSink, RuntimeConfig, RuntimeEventSink,
    ToolChoice, ToolExecution, TurnReport, TurnRequest,
};

/// Provider-neutral serial model/tool runtime for one turn at a time.
pub struct AgentRuntime {
    pub(super) provider: Arc<dyn ModelProvider>,
    pub(super) tools: ToolExposureSnapshot,
    pub(super) events: Arc<dyn RuntimeEventSink>,
    pub(super) config: RuntimeConfig,
}

impl AgentRuntime {
    /// Creates a runtime with no event streaming.
    pub fn new(
        provider: Arc<dyn ModelProvider>,
        tools: ToolExposureSnapshot,
        config: RuntimeConfig,
    ) -> Self {
        Self::with_event_sink(provider, tools, Arc::new(NoopEventSink), config)
    }

    /// Creates a runtime with an ordered event sink.
    pub fn with_event_sink(
        provider: Arc<dyn ModelProvider>,
        tools: ToolExposureSnapshot,
        events: Arc<dyn RuntimeEventSink>,
        config: RuntimeConfig,
    ) -> Self {
        Self {
            provider,
            tools,
            events,
            config,
        }
    }

    /// Runs one user turn until text completion or a typed stop condition.
    pub async fn run(&self, request: TurnRequest, cancellation: CancellationToken) -> TurnReport {
        super::driver::run(self, request, cancellation).await
    }

    pub(super) fn model_request(
        &self,
        request: &TurnRequest,
        messages: &[ModelMessage],
        text_only: bool,
        step_id: &str,
    ) -> ModelRequest {
        let tools = if text_only || self.config.tool_execution == ToolExecution::Disabled {
            Vec::new()
        } else {
            self.tools.definitions()
        };
        let tool_choice = if tools.is_empty() {
            ToolChoice::None
        } else {
            ToolChoice::Auto
        };
        ModelRequest {
            session_id: request.session_id.clone(),
            turn_id: request.turn_id.clone(),
            step_id: step_id.to_owned(),
            messages: messages.to_vec(),
            tools,
            tool_choice,
        }
    }
}
