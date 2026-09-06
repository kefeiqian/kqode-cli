use std::time::Duration;

use github_copilot_sdk::types::MessageOptions;

use super::{config, runtime::CopilotSdkRuntime, tools};
use crate::{
    inference::ChatError,
    tools::{ToolCall, ToolDefinition},
};

const TOOL_SELECTION_TIMEOUT: Duration = Duration::from_secs(120);
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(10);

pub struct CopilotSdkToolSelectionClient {
    model: String,
    runtime: CopilotSdkRuntime,
}

impl CopilotSdkToolSelectionClient {
    pub async fn start(preferred_model: &str) -> Result<Self, ChatError> {
        let runtime = CopilotSdkRuntime::start()
            .await
            .map_err(|error| ChatError::Request(format!("start Copilot SDK runtime: {error}")))?;
        let models = tokio::time::timeout(Duration::from_secs(30), runtime.client.list_models())
            .await
            .map_err(|_| ChatError::Request("Copilot SDK model listing timed out".to_owned()))?
            .map_err(|error| ChatError::Request(format!("list Copilot SDK models: {error}")))?;
        let model = models
            .iter()
            .find(|model| model.id == preferred_model)
            .or_else(|| models.first())
            .ok_or_else(|| {
                ChatError::Response("Copilot SDK did not report any available models".to_owned())
            })?
            .id
            .clone();
        Ok(Self { model, runtime })
    }

    pub async fn select_tool(
        &self,
        descriptions: &[ToolDefinition],
        prompt: &str,
    ) -> Result<ToolCall, ChatError> {
        let (observer, mut invocations) = tokio::sync::mpsc::unbounded_channel();
        let mut session_config =
            config::session_config(&self.model, crate::inference::ChatMode::Complete);
        session_config.tools = Some(tools::declarations_with_observer(descriptions, observer));
        session_config.available_tools = Some(tools::available_tool_names(descriptions));
        let session = self
            .runtime
            .client
            .create_session(session_config)
            .await
            .map_err(|error| {
                ChatError::Request(format!(
                    "create Copilot SDK tool-selection session: {error}"
                ))
            })?;
        let send = session
            .send_and_wait(MessageOptions::new(prompt).with_wait_timeout(TOOL_SELECTION_TIMEOUT));
        tokio::pin!(send);

        let invocation = tokio::time::timeout(TOOL_SELECTION_TIMEOUT, async {
            tokio::select! {
                biased;
                invocation = invocations.recv() => invocation.ok_or_else(|| {
                    ChatError::Response("Copilot SDK tool observer closed".to_owned())
                }),
                result = &mut send => Err(ChatError::Response(format!(
                    "Copilot SDK completed before selecting a tool: {result:?}"
                ))),
            }
        })
        .await
        .map_err(|_| ChatError::Request("Copilot SDK tool selection timed out".to_owned()))??;

        let _ = tokio::time::timeout(CLEANUP_TIMEOUT, session.abort()).await;
        tokio::time::timeout(CLEANUP_TIMEOUT, session.disconnect())
            .await
            .map_err(|_| ChatError::Request("Copilot SDK session disconnect timed out".to_owned()))?
            .map_err(|error| {
                ChatError::Request(format!("disconnect Copilot SDK session: {error}"))
            })?;

        Ok(ToolCall {
            id: invocation.tool_call_id,
            canonical_name: invocation.tool_name,
            arguments: invocation.arguments,
            argument_error: None,
        })
    }

    pub async fn stop(self) -> Result<(), ChatError> {
        self.runtime
            .stop()
            .await
            .map_err(|error| ChatError::Request(format!("stop Copilot SDK runtime: {error}")))
    }
}
