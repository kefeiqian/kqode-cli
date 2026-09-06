use std::time::Duration;

use reqwest::Client;
use serde_json::{Value, to_value};

use crate::{
    inference::{AssistantAction, ChatError, ChatMessage, ChatMode, ChatRole},
    provider::{
        ProviderConfig,
        openai_compatible::{request, response},
        shared::http,
    },
    tools::{ToolCall, ToolDefinition},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

pub struct KimiToolSelectionClient {
    client: Client,
    config: ProviderConfig,
}

impl KimiToolSelectionClient {
    pub fn new(config: ProviderConfig) -> Result<Self, ChatError> {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| ChatError::Request(format!("build Kimi live-test client: {error}")))?;
        Ok(Self { client, config })
    }

    pub async fn select_tool(
        &self,
        tools: &[ToolDefinition],
        prompt: &str,
    ) -> Result<ToolCall, ChatError> {
        let messages = [ChatMessage {
            role: ChatRole::User,
            content: prompt.to_owned(),
        }];
        let request = request::build_request(
            self.config.provider,
            &self.config.model,
            &messages,
            ChatMode::Complete,
            None,
            tools,
        );
        let mut payload = to_value(request)
            .map_err(|error| ChatError::Request(format!("encode Kimi request: {error}")))?;
        payload["tool_choice"] = Value::String("auto".to_owned());

        let response = self
            .client
            .post(http::endpoint(
                &self.config.api_base_url,
                "chat/completions",
            )?)
            .bearer_auth(self.config.api_key.trim())
            .json(&payload)
            .send()
            .await
            .map_err(|error| {
                ChatError::Request(format!("send Kimi tool-selection request: {error}"))
            })?;
        let body = http::response_body(response).await?;
        let response = response::parse_response(&body)?;
        let AssistantAction::ToolCalls(mut calls) = response.action else {
            return Err(ChatError::Response(
                "Kimi answered without selecting a tool".to_owned(),
            ));
        };
        if calls.len() != 1 {
            return Err(ChatError::Response(format!(
                "Kimi selected {} tools instead of one",
                calls.len()
            )));
        }
        Ok(calls.remove(0))
    }
}
