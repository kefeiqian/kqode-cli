//! Vendor-agnostic provider abstraction: a normalized chat request in, a stream
//! of [`StreamEvent`]s out. Vendor wire formats stay inside the concrete client
//! modules (currently only [`kimi`]).

pub mod error;
pub mod id;
pub mod kimi;
pub mod models;
pub mod registry;

pub use error::ProviderError;
pub use id::ProviderId;
pub use kimi::KimiProvider;
pub use models::{ModelInfo, ValidationOutcome, parse_models_response};
pub use registry::{
    CredentialSource, KeyResolver, KeySource, ProviderStatus, derive_status, validate_base_url,
};

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

    /// Builds an assistant-role message.
    #[must_use]
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: content.into(),
        }
    }
}

/// Sampling controls for a completion. `None` fields defer to the provider's own
/// defaults; pinning `temperature: Some(0.0)` (and `seed` when honored) requests
/// reproducible, greedy decoding, while the interactive path leaves both `None`.
#[derive(Clone, Copy, Debug, Default)]
pub struct Sampling {
    /// Sampling temperature; `Some(0.0)` requests greedy decoding.
    pub temperature: Option<f32>,
    /// Deterministic sampling seed, when the provider honors it.
    pub seed: Option<u64>,
}

/// Prompt/completion token counts reported by the provider.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Usage {
    /// Prompt (input) tokens.
    pub input: u32,
    /// Completion (output) tokens.
    pub output: u32,
}

/// A normalized, vendor-independent chat-completion request.
#[derive(Clone, Debug)]
pub struct ProviderRequest {
    /// Model id to complete with.
    pub model: String,
    /// Ordered messages (system prompt first, then history, then the new turn).
    pub messages: Vec<ChatMessage>,
    /// Sampling controls; [`Sampling::default`] (all `None`) preserves the
    /// provider's own defaults and the historical request body.
    pub sampling: Sampling,
    /// When `true`, request per-response token usage
    /// (`stream_options.include_usage`) so [`StreamEvent::Done`] can carry a
    /// [`Usage`]. Left `false` on the interactive path to keep the request body
    /// byte-identical.
    pub include_usage: bool,
}

/// An event produced while streaming a completion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StreamEvent {
    /// A chunk of assistant text.
    Delta(String),
    /// The stream reached its natural end, carrying the finish reason and/or the
    /// token usage when the provider reports them. They may arrive in separate
    /// terminal chunks, so either field can be `None` on a given `Done`.
    Done {
        /// Provider-reported reason the completion stopped, when present.
        finish_reason: Option<String>,
        /// Token usage, present only on the usage-bearing terminal chunk.
        usage: Option<Usage>,
    },
}
