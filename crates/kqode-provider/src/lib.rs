//! Concrete model provider adapters for KQode.

mod inference {
    pub(crate) use kqode_core::cancellation::ChatCancellationToken;
    pub(crate) use kqode_core::model::{
        AssistantAction, AssistantResponse, ChatCompletion, ChatDelta, ChatDeltaHandler, ChatError,
        ChatMessage, ChatMode, ChatRequest, ChatRole,
    };
    pub(crate) use kqode_core::system_prompt::SYSTEM_PROMPT;
}

mod tools {
    pub(crate) use kqode_core::tool::{
        MalformedToolArguments, ToolCall, ToolDefinition, ToolRegistry, ToolResult,
    };
    #[cfg(test)]
    pub(crate) use kqode_core::tool::{ToolCallError, ToolErrorKind};
}

mod provider;

pub use provider::{
    ANTHROPIC_API_BASE_URL, DEEPSEEK_API_BASE_URL, KIMI_API_BASE_URL, OPENAI_API_BASE_URL,
    Provider, ProviderConfig, ProviderConnectionStatus, chat, list_models, test_connection,
    validate_base_url, verify_packaged_runtime,
};

#[cfg(any(test, feature = "test-support"))]
#[doc(hidden)]
pub use provider::test_support;
