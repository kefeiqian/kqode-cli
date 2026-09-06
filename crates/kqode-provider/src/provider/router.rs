use crate::{
    inference::{
        ChatCancellationToken, ChatCompletion, ChatDeltaHandler, ChatError, ChatMessage, ChatMode,
        ChatRequest,
    },
    provider::{Provider, ProviderConfig},
    tools::ToolRegistry,
};

use super::{
    anthropic::AnthropicProvider, copilot::CopilotProvider, copilot_sdk::CopilotSdkProvider,
    custom::CustomProvider, deepseek::DeepseekProvider, kimi::KimiProvider, openai::OpenaiProvider,
};

pub async fn chat(
    config: &ProviderConfig,
    messages: &[ChatMessage],
    mode: ChatMode,
    cancellation: ChatCancellationToken,
    prompt_cache_key: Option<&str>,
    on_delta: Option<ChatDeltaHandler>,
    tool_registry: &ToolRegistry,
) -> Result<ChatCompletion, ChatError> {
    if config.provider.requires_model() && config.model.trim().is_empty() {
        return Err(ChatError::Configuration(
            "select a model in Settings before sending a message".to_owned(),
        ));
    }
    let tools = tool_registry.definitions();
    let request = ChatRequest {
        messages,
        mode,
        prompt_cache_key,
        tools: &tools,
    };
    match config.provider {
        Provider::Copilot => {
            let request = ChatRequest {
                messages,
                mode: ChatMode::Complete,
                prompt_cache_key: None,
                tools: &tools,
            };
            CopilotProvider::new(config)
                .chat(request, cancellation)
                .await
        }
        Provider::CopilotSdk => {
            CopilotSdkProvider::new(config)
                .chat(request, cancellation, on_delta)
                .await
        }
        Provider::Kimi => {
            KimiProvider::new(config)
                .chat(request, cancellation, on_delta)
                .await
        }
        Provider::Openai => {
            OpenaiProvider::new(config)
                .chat(request, cancellation, on_delta)
                .await
        }
        Provider::Anthropic => {
            AnthropicProvider::new(config)
                .chat(request, cancellation, on_delta)
                .await
        }
        Provider::Deepseek => {
            DeepseekProvider::new(config)
                .chat(request, cancellation, on_delta)
                .await
        }
        Provider::Custom => {
            CustomProvider::new(config)
                .chat(request, cancellation, on_delta)
                .await
        }
    }
}

/// Lists models exposed by the selected provider.
///
/// # Errors
///
/// Returns an error when the provider cannot list models.
pub async fn list_models(config: &ProviderConfig) -> Result<Vec<String>, ChatError> {
    match config.provider {
        Provider::Copilot => CopilotProvider::new(config).list_models().await,
        Provider::CopilotSdk => CopilotSdkProvider::new(config).list_models().await,
        Provider::Kimi => KimiProvider::new(config).list_models().await,
        Provider::Openai => OpenaiProvider::new(config).list_models().await,
        Provider::Anthropic => AnthropicProvider::new(config).list_models().await,
        Provider::Deepseek => DeepseekProvider::new(config).list_models().await,
        Provider::Custom => CustomProvider::new(config).list_models().await,
    }
}
