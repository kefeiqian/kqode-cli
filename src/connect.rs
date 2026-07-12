//! Provider connect validation and model-catalog loading.
//!
//! Esc during an in-flight validation is allowed to complete on the backend:
//! a connected response persists settings/key/selection. The TUI may discard a
//! late result for a closed surface; a backend cancellation RPC is out of scope.

mod http;
mod sanitize;
mod selection;
mod submit;

pub(crate) use submit::resolve_submit_config;

use crate::protocol::{
    MODEL_LIST_STATUS_EMPTY, MODEL_LIST_STATUS_FAILED, MODEL_LIST_STATUS_LOADED, ModelListResult,
    SetKeyResult,
};
use crate::provider::registry::{ProviderEndpoint, provider_descriptor};
use crate::provider::{ProviderId, ValidationOutcome, validate_base_url};
use crate::secrets::ApiKey;
use crate::store::Store;

/// Synchronously validated inputs moved onto the deferred set-key worker.
#[derive(Debug)]
pub struct SetKeyWork {
    pub provider: ProviderId,
    pub base_url: String,
    pub label: Option<String>,
    pub key: ApiKey,
}

/// Resolves and validates set-key provider/base-url inputs before spawning.
///
/// # Errors
///
/// Returns a sanitized string when the provider is unknown, a Custom URL is
/// missing, or the Custom URL is malformed/non-HTTPS.
pub fn prepare_set_key_work(
    provider_id: &str,
    base_url: Option<String>,
    label: Option<String>,
    key: ApiKey,
) -> Result<SetKeyWork, String> {
    let provider =
        ProviderId::parse(provider_id).ok_or_else(|| "unknown provider id".to_owned())?;
    let descriptor = provider_descriptor(provider);
    let base_url = match descriptor.endpoint {
        ProviderEndpoint::Fixed { base_url } => base_url.to_owned(),
        ProviderEndpoint::Custom => validate_base_url(
            base_url
                .as_deref()
                .ok_or_else(|| "custom provider baseUrl is required".to_owned())?,
        )
        .map_err(|error| error.to_string())?,
    };
    Ok(SetKeyWork {
        provider,
        base_url,
        label,
        key,
    })
}

/// Validates a key and persists settings/key/selection on success.
#[must_use]
pub async fn set_provider_key(store: Store, work: SetKeyWork) -> SetKeyResult {
    let outcome = http::fetch_models(&work.base_url, &work.key).await;
    let ValidationOutcome::Connected(models) = outcome else {
        return SetKeyResult {
            outcome: selection::set_key_outcome(&outcome),
            selected_model: None,
        };
    };
    selection::persist_connected_provider(&store, &work, &models, crate::secrets::set_key)
        .unwrap_or_else(|()| selection::store_failed())
}

/// Loads a provider's model catalog using the currently resolvable key.
///
/// Catalog loading always uses the selected provider endpoint and keychain key.
/// Custom providers without a persisted endpoint or key fail closed.
#[must_use]
pub async fn list_models(store: Store, provider: ProviderId) -> ModelListResult {
    let Some(key) = crate::secrets::resolve_key(provider) else {
        return model_failed();
    };
    let Some(base_url) = resolve_base_url(&store, provider) else {
        return model_failed();
    };
    match http::fetch_models(&base_url, &key).await {
        ValidationOutcome::Connected(models) => ModelListResult {
            status: MODEL_LIST_STATUS_LOADED,
            models: models.into_iter().map(sanitize::sanitize_model).collect(),
        },
        ValidationOutcome::EmptyCatalog => ModelListResult {
            status: MODEL_LIST_STATUS_EMPTY,
            models: Vec::new(),
        },
        _ => model_failed(),
    }
}

/// Resolves a provider's API base URL for outbound requests.
///
/// Preset (`Fixed`) providers always use their compiled endpoint and never
/// consult the store, preserving the SSRF guarantee that a preset URL can't be
/// overridden. The Custom provider uses persisted store settings only. Shared
/// by submit resolution and `/model` catalog loading so both agree on where to
/// reach a provider.
#[must_use]
pub(crate) fn resolve_base_url(store: &Store, provider: ProviderId) -> Option<String> {
    match provider_descriptor(provider).endpoint {
        ProviderEndpoint::Fixed { base_url } => Some(base_url.to_owned()),
        ProviderEndpoint::Custom => store
            .provider_settings(ProviderId::Custom)
            .ok()
            .flatten()
            .map(|settings| settings.base_url),
    }
}

fn model_failed() -> ModelListResult {
    ModelListResult {
        status: MODEL_LIST_STATUS_FAILED,
        models: Vec::new(),
    }
}

#[cfg(test)]
mod tests;
