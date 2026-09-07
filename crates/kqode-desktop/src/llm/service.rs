use std::sync::{Arc, Mutex, MutexGuard};

use crate::inference::{ChatCompletion, ChatError, ChatMessage, ChatMode, ChatRequestOptions};
use crate::settings::{LlmSettings, Provider, SettingsStore};
use crate::tools::ToolRegistry;
use kqode_core::validation::validate_chat_messages;
use kqode_provider::{
    ProviderConfig, ProviderConnectionStatus, chat as provider_chat,
    list_models as provider_models, test_connection as provider_test_connection,
};

use super::validation::validate_selection;

/// Application-wide entry point for LLM operations.
#[derive(Clone)]
pub struct LlmService {
    settings_store: Arc<Mutex<SettingsStore>>,
    tool_registry: Arc<ToolRegistry>,
}

impl LlmService {
    pub fn new(settings_store: Arc<Mutex<SettingsStore>>) -> Self {
        Self {
            settings_store,
            tool_registry: Arc::new(ToolRegistry::builtins()),
        }
    }

    /// Sends a chat request using the selected provider and model.
    ///
    /// # Errors
    ///
    /// Returns an error when the conversation selection is incomplete,
    /// provider settings cannot be loaded, or the provider request fails.
    pub async fn chat(
        &self,
        provider: Option<Provider>,
        model: Option<String>,
        messages: Vec<ChatMessage>,
        mode: ChatMode,
    ) -> Result<ChatCompletion, ChatError> {
        self.chat_with_options(
            provider,
            model,
            messages,
            mode,
            ChatRequestOptions::default(),
        )
        .await
    }

    async fn chat_with_options(
        &self,
        provider: Option<Provider>,
        model: Option<String>,
        messages: Vec<ChatMessage>,
        mode: ChatMode,
        options: ChatRequestOptions,
    ) -> Result<ChatCompletion, ChatError> {
        validate_chat_messages(&messages)?;
        let settings = resolve_chat_settings(provider, model, &self.settings_store)?;
        let config = provider_config(&settings);
        provider_chat(
            &config,
            &messages,
            mode,
            options.cancellation,
            options.prompt_cache_key.as_ref().map(|key| key.as_str()),
            options.on_delta,
            &self.tool_registry,
        )
        .await
    }

    pub(crate) async fn chat_cancellable_with_deltas(
        &self,
        provider: Option<Provider>,
        model: Option<String>,
        messages: Vec<ChatMessage>,
        mode: ChatMode,
        options: ChatRequestOptions,
    ) -> Result<ChatCompletion, ChatError> {
        self.chat_with_options(provider, model, messages, mode, options)
            .await
    }

    /// Validates that a conversation has enough model selection data to send.
    ///
    /// # Errors
    ///
    /// Returns an error when no provider or required model is selected.
    pub fn validate_selection(
        &self,
        provider: Option<Provider>,
        model: Option<&str>,
    ) -> Result<(), ChatError> {
        validate_selection(provider, model)?;
        Ok(())
    }

    /// Lists models for the supplied provider settings.
    ///
    /// # Errors
    ///
    /// Returns an error when credentials cannot be resolved, the cache cannot
    /// be accessed, the background task fails, or the provider request fails.
    pub async fn list_models(
        &self,
        settings: LlmSettings,
        force_refresh: bool,
    ) -> Result<Vec<String>, ChatError> {
        let settings = {
            let store = lock_settings(&self.settings_store)?;
            let settings = store.resolve_api_key(&settings).map_err(settings_error)?;
            if settings.provider.requires_api_key() && settings.api_key.trim().is_empty() {
                return Ok(Vec::new());
            }
            if !force_refresh
                && let Some(models) = store.cached_models(&settings).map_err(settings_error)?
            {
                return Ok(models);
            }
            settings
        };

        let models = provider_models(&provider_config(&settings)).await?;
        lock_settings(&self.settings_store)?
            .cache_models(&settings, &models)
            .map_err(settings_error)?;
        Ok(models)
    }

    /// Verifies provider availability and model discovery.
    ///
    /// # Errors
    ///
    /// Returns an error when credentials cannot be resolved or the provider
    /// cannot start or list models.
    pub async fn test_connection(
        &self,
        settings: LlmSettings,
    ) -> Result<ProviderConnectionStatus, ChatError> {
        let settings = {
            let store = lock_settings(&self.settings_store)?;
            let settings = store.resolve_api_key(&settings).map_err(settings_error)?;
            if settings.provider.requires_api_key() && settings.api_key.trim().is_empty() {
                return Err(ChatError::Configuration(
                    "enter an API key before testing the provider connection".to_owned(),
                ));
            }
            settings
        };

        provider_test_connection(&provider_config(&settings)).await
    }
}

fn resolve_chat_settings(
    provider: Option<Provider>,
    model: Option<String>,
    store: &Mutex<SettingsStore>,
) -> Result<LlmSettings, ChatError> {
    let (provider, model) = validate_selection(provider, model.as_deref())?;
    let mut settings = lock_settings(store)?
        .load_provider_settings(provider)
        .map_err(settings_error)?;
    settings.model = model;
    Ok(settings)
}

fn lock_settings(store: &Mutex<SettingsStore>) -> Result<MutexGuard<'_, SettingsStore>, ChatError> {
    store
        .lock()
        .map_err(|error| ChatError::Configuration(format!("lock settings database: {error}")))
}

fn settings_error(error: impl ToString) -> ChatError {
    ChatError::Configuration(error.to_string())
}

fn provider_config(settings: &LlmSettings) -> ProviderConfig {
    ProviderConfig::new(
        settings.provider,
        settings.api_base_url.clone(),
        settings.api_key.clone(),
        settings.model.clone(),
    )
}
