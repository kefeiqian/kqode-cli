//! Vendor-agnostic provider abstraction: a normalized chat request in, a stream
//! of [`StreamEvent`]s out. Vendor wire formats stay inside the concrete client
//! modules (currently only [`kimi`]).

pub mod error;
pub mod kimi;

pub use error::ProviderError;
pub use kimi::KimiProvider;

use serde::Serialize;

/// Role of a chat message. Serializes to the OpenAI-compatible lowercase tag.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// The system/base prompt.
    System,
    /// A message authored by the user.
    User,
    /// A message authored by the assistant.
    Assistant,
}

/// A single role-tagged message in the normalized request.
#[derive(Clone, Debug, Serialize)]
pub struct ChatMessage {
    /// Who authored the message.
    pub role: Role,
    /// The message text.
    pub content: String,
}

impl ChatMessage {
    /// Builds a system-role message.
    #[must_use]
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: content.into(),
        }
    }

    /// Builds a user-role message.
    #[must_use]
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: content.into(),
        }
    }
}

/// A normalized, vendor-independent chat-completion request.
#[derive(Clone, Debug)]
pub struct ProviderRequest {
    /// Model id to complete with.
    pub model: String,
    /// Ordered messages (system prompt first, then history, then the new turn).
    pub messages: Vec<ChatMessage>,
}

/// An event produced while streaming a completion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StreamEvent {
    /// A chunk of assistant text.
    Delta(String),
    /// The stream reached its natural end, carrying the finish reason if known.
    Done {
        /// Provider-reported reason the completion stopped, when present.
        finish_reason: Option<String>,
    },
}
