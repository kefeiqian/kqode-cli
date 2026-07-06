//! Submit-time provider selection and credential resolution.

use crate::config::KimiConfig;
use crate::provider::ProviderId;
use crate::provider::registry;
use crate::secrets;
use crate::store::Store;

/// Resolves the provider/model/key/base URL used by a submit request.
///
/// An explicit active selection is authoritative: if its key or custom endpoint
/// cannot be resolved, the submit needs configuration and does not switch to
/// another provider. When no active selection exists, the effective default is
/// the first registry provider with a resolvable key and a resolvable default
/// model (a preset's compiled default, or the Custom provider's `.env` model).
#[must_use]
pub(crate) fn resolve_submit_config(store: Option<&Store>) -> Option<KimiConfig> {
    let (provider, model) = match active_choice(store) {
        Some(choice) => choice,
        None => effective_default()?,
    };
    let key = secrets::resolve_key(provider)?;
    let base_url = crate::login::resolve_base_url(store, provider)?;

    Some(KimiConfig {
        api_key: key.expose().to_owned(),
        model,
        base_url,
    })
}

fn active_choice(store: Option<&Store>) -> Option<(ProviderId, String)> {
    store
        .and_then(|store| store.active_selection().ok().flatten())
        .map(|selection| (selection.provider, selection.model_id))
}

fn effective_default() -> Option<(ProviderId, String)> {
    registry::PROVIDERS.iter().find_map(|descriptor| {
        let model = registry::effective_default_model(descriptor.id)?;
        secrets::resolve_key(descriptor.id)?;
        Some((descriptor.id, model))
    })
}

#[cfg(test)]
mod tests;
