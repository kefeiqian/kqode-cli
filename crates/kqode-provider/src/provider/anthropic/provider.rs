use reqwest::StatusCode;

use crate::{
    inference::{
        ChatCancellationToken, ChatCompletion, ChatDeltaHandler, ChatError, ChatMode, ChatRequest,
    },
    provider::{Provider, ProviderConfig},
};

use super::super::shared::http;
use super::{request, response, streaming};

const API_VERSION: &str = "2023-06-01";

pub(in crate::provider) struct AnthropicProvider<'a> {
    config: &'a ProviderConfig,
}

impl<'a> AnthropicProvider<'a> {
    pub(in crate::provider) fn new(config: &'a ProviderConfig) -> Self {
        debug_assert_eq!(config.provider, Provider::Anthropic);
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
        let response = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(ChatError::Cancelled),
            response = self.request("messages")?
                .json(&request::build_request(
                    &self.config.model,
                    request.messages,
                    request.mode,
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
        let response = self
            .models_request()?
            .send()
            .await
            .map_err(|error| ChatError::Request(format!("fetch model list: {error}")))?;
        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(http::authentication_error(self.config.provider));
        }
        response::parse_models(&http::response_body(response).await?)
    }

    fn request(&self, path: &str) -> Result<reqwest::RequestBuilder, ChatError> {
        Ok(http::client()?
            .post(http::endpoint(&self.config.api_base_url, path)?)
            .header("x-api-key", self.config.api_key.trim())
            .header("anthropic-version", API_VERSION))
    }

    fn models_request(&self) -> Result<reqwest::RequestBuilder, ChatError> {
        Ok(http::client()?
            .get(http::endpoint(&self.config.api_base_url, "models")?)
            .header("x-api-key", self.config.api_key.trim())
            .header("anthropic-version", API_VERSION))
    }
}

#[cfg(test)]
mod tests {
    use reqwest::Method;

    use super::{API_VERSION, AnthropicProvider};
    use crate::provider::{Provider, ProviderConfig};

    #[test]
    fn builds_model_listing_as_an_authenticated_get_request() {
        let config = ProviderConfig::new(
            Provider::Anthropic,
            "https://api.anthropic.com/v1".to_owned(),
            "test-key".to_owned(),
            "test-model".to_owned(),
        );
        let request = AnthropicProvider::new(&config)
            .models_request()
            .unwrap()
            .build()
            .unwrap();

        assert_eq!(request.method(), Method::GET);
        assert_eq!(
            request.url().as_str(),
            "https://api.anthropic.com/v1/models"
        );
        assert_eq!(request.headers()["x-api-key"], "test-key");
        assert_eq!(request.headers()["anthropic-version"], API_VERSION);
    }
}
