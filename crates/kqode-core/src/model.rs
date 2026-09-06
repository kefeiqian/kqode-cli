use std::{error::Error, fmt, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::{cancellation::CancellationToken, tool::ToolDefinition};

/// Role of one model-visible chat message.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
}

/// One model-visible chat message.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

/// Final text completion returned to the current desktop application.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ChatCompletion {
    pub message: String,
    pub model: String,
}

/// Provider-neutral response from one model request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssistantResponse {
    pub action: AssistantAction,
    pub model: String,
}

/// Action selected by the model for one response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AssistantAction {
    Message(String),
    ToolCalls(Vec<crate::tool::ToolCall>),
}

impl AssistantResponse {
    /// Converts a text response into the desktop completion shape.
    ///
    /// # Errors
    ///
    /// Returns [`ChatError::Response`] when the model selected tools because the
    /// current desktop path does not execute them yet.
    pub fn into_completion(self) -> Result<ChatCompletion, ChatError> {
        match self.action {
            AssistantAction::Message(message) => Ok(ChatCompletion {
                message,
                model: self.model,
            }),
            AssistantAction::ToolCalls(_) => Err(ChatError::Response(
                "LLM returned tool calls while tool execution is disabled".to_owned(),
            )),
        }
    }
}

/// One streamed text fragment from a provider.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChatDelta {
    pub content: String,
    pub model: Option<String>,
}

/// Receives streamed text fragments from a provider.
pub type ChatDeltaHandler = Arc<dyn Fn(ChatDelta) + Send + Sync>;

/// Response mode requested from a provider.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum ChatMode {
    Complete,
    #[default]
    Streaming,
}

/// Borrowed input for one provider request.
pub struct ChatRequest<'a> {
    pub messages: &'a [ChatMessage],
    pub mode: ChatMode,
    pub prompt_cache_key: Option<&'a str>,
    pub tools: &'a [ToolDefinition],
}

/// Application-owned options passed into the current provider adapters.
#[derive(Default)]
pub struct ChatRequestOptions {
    pub cancellation: CancellationToken,
    pub prompt_cache_key: Option<PromptCacheKey>,
    pub on_delta: Option<ChatDeltaHandler>,
}

impl ChatRequestOptions {
    /// Creates streaming options scoped to one desktop conversation.
    pub fn streaming_for_conversation(
        conversation_id: &str,
        cancellation: CancellationToken,
        on_delta: ChatDeltaHandler,
    ) -> Self {
        Self {
            cancellation,
            prompt_cache_key: Some(PromptCacheKey::for_conversation(conversation_id)),
            on_delta: Some(on_delta),
        }
    }
}

/// Stable provider cache key derived from one conversation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PromptCacheKey(String);

impl PromptCacheKey {
    const NAMESPACE: &'static str = "kqode";

    /// Creates a cache key for one conversation identifier.
    pub fn for_conversation(conversation_id: &str) -> Self {
        Self(format!("{}:{conversation_id}", Self::NAMESPACE))
    }

    /// Returns the provider-facing cache key.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Failure returned by the current provider-neutral chat boundary.
#[derive(Debug)]
pub enum ChatError {
    Configuration(String),
    Request(String),
    Api(String),
    Response(String),
    Cancelled,
}

impl fmt::Display for ChatError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Configuration(message)
            | Self::Request(message)
            | Self::Api(message)
            | Self::Response(message) => formatter.write_str(message),
            Self::Cancelled => formatter.write_str("LLM request was stopped"),
        }
    }
}

impl Error for ChatError {}
