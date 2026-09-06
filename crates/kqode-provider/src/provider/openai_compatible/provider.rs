use reqwest::StatusCode;

use crate::{
    inference::{
        ChatCancellationToken, ChatCompletion, ChatDeltaHandler, ChatError, ChatMode, ChatRequest,
    },
    provider::ProviderConfig,
};

use super::super::shared::http;
use super::{request, response, streaming};

pub(in crate::provider) struct OpenAiCompatibleProvider<'a> {
    config: &'a ProviderConfig,
}

impl<'a> OpenAiCompatibleProvider<'a> {
    pub(in crate::provider) fn new(config: &'a ProviderConfig) -> Self {
        Self { config }
    }

    pub(in crate::provider) async fn chat(
        &self,
        request: ChatRequest<'_>,
        cancellation: ChatCancellationToken,
        on_delta: Option<ChatDeltaHandler>,
    ) -> Result<ChatCompletion, ChatError> {
        http::validate_api_key(self.config)?;
        if cancellation.is_cancelled() {
            return Err(ChatError::Cancelled);
        }
        let endpoint = http::endpoint(&self.config.api_base_url, "chat/completions")?;
        let response = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(ChatError::Cancelled),
            response = http::client()?
                .post(endpoint)
                .bearer_auth(self.config.api_key.trim())
                .json(&request::build_request(
                    self.config.provider,
                    &self.config.model,
                    request.messages,
                    request.mode,
                    request.prompt_cache_key,
                    request.tools,
                ))
                .send() => response.map_err(|error| {
                    ChatError::Request(format!("send message to LLM: {error}"))
                })?,
        };
        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(http::authentication_error(self.config.provider));
        }
        match request.mode {
            ChatMode::Complete => {
                let body = tokio::select! {
                    biased;
                    () = cancellation.cancelled() => return Err(ChatError::Cancelled),
                    body = http::response_body(response) => body?,
                };
                response::parse_completion(&body)
            }
            ChatMode::Streaming => {
                streaming::parse_stream(response, &self.config.model, cancellation, on_delta).await
            }
        }
    }

    pub(in crate::provider) async fn list_models(&self) -> Result<Vec<String>, ChatError> {
        http::validate_api_key(self.config)?;
        let response = http::client()?
            .get(http::endpoint(&self.config.api_base_url, "models")?)
            .bearer_auth(self.config.api_key.trim())
            .send()
            .await
            .map_err(|error| ChatError::Request(format!("fetch model list: {error}")))?;
        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(http::authentication_error(self.config.provider));
        }
        response::parse_models(&http::response_body(response).await?)
    }
}
