use crate::config::KIMI_API_KEY_VAR;
use crate::protocol::{
    ActiveSelectionResult, CREDENTIAL_SOURCE_ENV, CREDENTIAL_SOURCE_KEYCHAIN, ClearKeyParams,
    ClearKeyResult, PROVIDER_STATUS_CONNECTED, PROVIDER_STATUS_NOT_CONFIGURED, ProviderListResult,
    ProviderStatusInfo, SelectionSetParams, SelectionSetResult,
};
use crate::provider::ProviderId;
use crate::provider::registry::{
    self, CredentialSource, KeySource, ProviderEndpoint, ProviderStatus,
};
use crate::secrets::KeychainError;
use crate::store::{ActiveSelection, ProviderSettings, Store};

/// Builds provider status rows from SQLite's cached key-present bit and Kimi's
/// environment fallback, without reading the OS keychain.
#[must_use]
pub(crate) fn provider_list(store: Option<&Store>) -> ProviderListResult {
    let providers = registry::PROVIDERS
        .iter()
        .map(|descriptor| {
            let settings = provider_settings(store, descriptor.id);
            let source = key_source(descriptor.id, settings.as_ref());
            let status = registry::derive_status(descriptor.id, &move |provider| {
                if provider == descriptor.id {
                    source
                } else {
                    key_source(provider, None)
                }
            });
            let (status, credential_source) = status_fields(status);
            ProviderStatusInfo {
                provider_id: descriptor.id.as_str().to_owned(),
                label: settings
                    .as_ref()
                    .and_then(|settings| settings.label.clone())
                    .unwrap_or_else(|| descriptor.label.to_owned()),
                base_url: settings
                    .as_ref()
                    .map(|settings| settings.base_url.clone())
                    .or_else(|| descriptor_base_url(descriptor.endpoint)),
                status,
                credential_source,
            }
        })
        .collect();
    ProviderListResult { providers }
}

/// Reads the active selection, returning nulls when persistence is degraded or unset.
#[must_use]
pub(crate) fn active_selection(store: Option<&Store>) -> ActiveSelectionResult {
    match store.and_then(|store| store.active_selection().ok().flatten()) {
        Some(selection) => ActiveSelectionResult {
            provider_id: Some(selection.provider.as_str().to_owned()),
            model_id: Some(selection.model_id),
        },
        None => ActiveSelectionResult {
            provider_id: None,
            model_id: None,
        },
    }
}

/// Persists the active provider/model selection.
#[must_use]
pub(crate) fn set_active_selection(
    store: Option<&Store>,
    params: SelectionSetParams,
) -> SelectionSetResult {
    let Some(store) = store else {
        return SelectionSetResult { ok: false };
    };
    let Some(provider) = ProviderId::parse(&params.provider_id) else {
        return SelectionSetResult { ok: false };
    };
    let selection = ActiveSelection {
        provider,
        model_id: params.model_id,
    };
    SelectionSetResult {
        ok: store.set_active_selection(&selection).is_ok(),
    }
}

/// Clears the provider key best-effort and clears SQLite's key-present bit.
#[must_use]
pub(crate) fn clear_provider_key(store: Option<&Store>, params: ClearKeyParams) -> ClearKeyResult {
    let Some(provider) = ProviderId::parse(&params.provider_id) else {
        return ClearKeyResult { ok: false };
    };
    let keychain_ok = matches!(
        crate::secrets::clear_key(provider),
        Ok(()) | Err(KeychainError::Unavailable)
    );
    let store_ok = store
        .map(|store| store.set_key_present(provider, false).is_ok())
        .unwrap_or(true);
    ClearKeyResult {
        ok: keychain_ok && store_ok,
    }
}

fn provider_settings(store: Option<&Store>, provider: ProviderId) -> Option<ProviderSettings> {
    store.and_then(|store| store.provider_settings(provider).ok().flatten())
}

fn key_source(provider: ProviderId, settings: Option<&ProviderSettings>) -> KeySource {
    if settings.is_some_and(|settings| settings.key_present) {
        return KeySource::Keychain;
    }
    if provider == ProviderId::Kimi
        && std::env::var(KIMI_API_KEY_VAR).is_ok_and(|value| !value.trim().is_empty())
    {
        return KeySource::Env;
    }
    KeySource::None
}

fn descriptor_base_url(endpoint: ProviderEndpoint) -> Option<String> {
    match endpoint {
        ProviderEndpoint::Fixed { base_url } => Some(base_url.to_owned()),
        ProviderEndpoint::Custom => None,
    }
}

fn status_fields(status: ProviderStatus) -> (&'static str, Option<&'static str>) {
    match status {
        ProviderStatus::Connected(CredentialSource::Keychain) => {
            (PROVIDER_STATUS_CONNECTED, Some(CREDENTIAL_SOURCE_KEYCHAIN))
        }
        ProviderStatus::Connected(CredentialSource::Env) => {
            (PROVIDER_STATUS_CONNECTED, Some(CREDENTIAL_SOURCE_ENV))
        }
        ProviderStatus::NotConfigured => (PROVIDER_STATUS_NOT_CONFIGURED, None),
    }
}

#[cfg(test)]
mod tests;
