use crate::protocol::{
    ActiveSelectionResult, CREDENTIAL_SOURCE_KEYCHAIN, ClearKeyParams, ClearKeyResult,
    PROVIDER_STATUS_CONNECTED, PROVIDER_STATUS_NOT_CONFIGURED, ProviderListResult,
    ProviderStatusInfo, SelectionSetParams, SelectionSetResult,
};
use crate::provider::ProviderId;
use crate::provider::registry::{
    self, CredentialSource, KeySource, ProviderEndpoint, ProviderStatus,
};
use crate::secrets::KeychainError;
use crate::store::{ActiveSelection, ProviderSettings, Store};

/// Builds provider status rows from SQLite's cached key-present bit.
#[must_use]
pub(crate) fn provider_list(store: &Store) -> ProviderListResult {
    let providers = registry::PROVIDERS
        .iter()
        .map(|descriptor| {
            let settings = provider_settings(store, descriptor.id);
            let source = key_source(settings.as_ref());
            let raw_status = registry::derive_status(descriptor.id, &move |provider| {
                if provider == descriptor.id {
                    source
                } else {
                    key_source(None)
                }
            });
            let base_url = settings
                .as_ref()
                .map(|settings| settings.base_url.clone())
                .or_else(|| fallback_base_url(descriptor.endpoint));
            let status = gate_status_on_base_url(descriptor.id, raw_status, base_url.as_deref());
            let (status, credential_source) = status_fields(status);
            ProviderStatusInfo {
                provider_id: descriptor.id.as_str().to_owned(),
                label: settings
                    .as_ref()
                    .and_then(|settings| settings.label.clone())
                    .unwrap_or_else(|| descriptor.label.to_owned()),
                base_url,
                default_model: registry::effective_default_model(descriptor.id),
                status,
                credential_source,
            }
        })
        .collect();
    ProviderListResult { providers }
}

/// Reads the active selection, returning nulls when unset.
#[must_use]
pub(crate) fn active_selection(store: &Store) -> ActiveSelectionResult {
    match store.active_selection().ok().flatten() {
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
    store: &Store,
    params: SelectionSetParams,
) -> SelectionSetResult {
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

/// Clears the provider key and then clears SQLite's key-present bit.
#[must_use]
pub(crate) fn clear_provider_key(store: &Store, params: ClearKeyParams) -> ClearKeyResult {
    let Some(provider) = ProviderId::parse(&params.provider_id) else {
        return ClearKeyResult { ok: false };
    };
    clear_provider_key_with(store, provider, crate::secrets::clear_key)
}

fn clear_provider_key_with(
    store: &Store,
    provider: ProviderId,
    clear_key: impl FnOnce(ProviderId) -> Result<(), KeychainError>,
) -> ClearKeyResult {
    if clear_key(provider).is_err() {
        return ClearKeyResult { ok: false };
    }
    ClearKeyResult {
        ok: store.set_key_present(provider, false).is_ok(),
    }
}

fn provider_settings(store: &Store, provider: ProviderId) -> Option<ProviderSettings> {
    store.provider_settings(provider).ok().flatten()
}

fn key_source(settings: Option<&ProviderSettings>) -> KeySource {
    if settings.is_some_and(|settings| settings.key_present) {
        KeySource::Keychain
    } else {
        KeySource::None
    }
}

/// Base URL to show when no stored provider settings exist: a preset's fixed
/// endpoint, or none for the Custom provider.
fn fallback_base_url(endpoint: ProviderEndpoint) -> Option<String> {
    match endpoint {
        ProviderEndpoint::Fixed { base_url } => Some(base_url.to_owned()),
        ProviderEndpoint::Custom => None,
    }
}

/// Downgrades a Custom provider's connected status to not-configured when no
/// base URL resolves.
///
/// The Custom endpoint is user-supplied, so a credential without a resolvable
/// store base URL is unusable — the submit path already
/// yields needs-configuration in that case. Gating the status here keeps the
/// selection surfaces from advertising a provider that cannot serve a turn.
/// Preset providers have a fixed compiled endpoint and are never gated.
fn gate_status_on_base_url(
    provider: ProviderId,
    status: ProviderStatus,
    base_url: Option<&str>,
) -> ProviderStatus {
    if provider == ProviderId::Custom && base_url.is_none() {
        ProviderStatus::NotConfigured
    } else {
        status
    }
}

fn status_fields(status: ProviderStatus) -> (&'static str, Option<&'static str>) {
    match status {
        ProviderStatus::Connected(CredentialSource::Keychain) => {
            (PROVIDER_STATUS_CONNECTED, Some(CREDENTIAL_SOURCE_KEYCHAIN))
        }
        ProviderStatus::NotConfigured => (PROVIDER_STATUS_NOT_CONFIGURED, None),
    }
}

#[cfg(test)]
mod tests;
