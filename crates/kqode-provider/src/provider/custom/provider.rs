use crate::{
    inference::{ChatCancellationToken, ChatCompletion, ChatDeltaHandler, ChatError, ChatRequest},
    provider::{Provider, ProviderConfig, openai_compatible::OpenAiCompatibleProvider},
};

pub(in crate::provider) struct CustomProvider<'a>(OpenAiCompatibleProvider<'a>);

impl<'a> CustomProvider<'a> {
    pub(in crate::provider) fn new(config: &'a ProviderConfig) -> Self {
        debug_assert_eq!(config.provider, Provider::Custom);
        Self(OpenAiCompatibleProvider::new(config))
    }

    pub(in crate::provider) async fn chat(
        &self,
        request: ChatRequest<'_>,
        cancellation: ChatCancellationToken,
        on_delta: Option<ChatDeltaHandler>,
    ) -> Result<ChatCompletion, ChatError> {
        self.0.chat(request, cancellation, on_delta).await
    }

    pub(in crate::provider) async fn list_models(&self) -> Result<Vec<String>, ChatError> {
        self.0.list_models().await
    }
}
