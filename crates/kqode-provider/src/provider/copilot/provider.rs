use std::time::Duration;

use super::{
    command, output,
    request::{conversation_prompt, safe_arguments},
};
use crate::inference::{ChatCancellationToken, ChatCompletion, ChatError, ChatMode, ChatRequest};
use crate::provider::ProviderConfig;

const CHAT_TIMEOUT: Duration = Duration::from_secs(600);
const LIST_MODELS_TIMEOUT: Duration = Duration::from_secs(30);

pub(in crate::provider) struct CopilotProvider<'a> {
    config: &'a ProviderConfig,
}

impl<'a> CopilotProvider<'a> {
    pub(in crate::provider) fn new(config: &'a ProviderConfig) -> Self {
        Self { config }
    }
}

impl CopilotProvider<'_> {
    pub(in crate::provider) async fn chat(
        &self,
        request: ChatRequest<'_>,
        cancellation: ChatCancellationToken,
    ) -> Result<ChatCompletion, ChatError> {
        if request.mode == ChatMode::Streaming {
            return Err(ChatError::Configuration(
                "streaming chat is not implemented yet".to_owned(),
            ));
        }

        let prompt = conversation_prompt(request);
        let mut arguments = safe_arguments();
        arguments.extend(["--stream".to_owned(), "off".to_owned()]);
        if !self.config.model.trim().is_empty() {
            arguments.extend(["--model".to_owned(), self.config.model.trim().to_owned()]);
        }
        arguments.extend(["--prompt".to_owned(), prompt]);

        let output = tokio::task::spawn_blocking(move || {
            command::run(&arguments, CHAT_TIMEOUT, Some(&cancellation))
        })
        .await
        .map_err(|error| ChatError::Request(format!("Copilot CLI task failed: {error}")))??;
        let mut completion = output::parse_chat(&output)?;
        if completion.model.is_empty() {
            completion.model = self.config.model.clone();
        }
        Ok(completion)
    }

    pub(in crate::provider) async fn list_models(&self) -> Result<Vec<String>, ChatError> {
        let output = tokio::task::spawn_blocking(|| {
            command::run(
                &["help".to_owned(), "config".to_owned()],
                LIST_MODELS_TIMEOUT,
                None,
            )
        })
        .await
        .map_err(|error| ChatError::Request(format!("Copilot CLI task failed: {error}")))??;
        let models = output::parse_models(&output);
        if models.is_empty() {
            return Err(ChatError::Response(
                "Copilot CLI did not report any available models".to_owned(),
            ));
        }
        Ok(models)
    }
}
