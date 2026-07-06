use std::time::{SystemTime, UNIX_EPOCH};

use crate::login::SetKeyWork;
use crate::protocol::{
    SET_KEY_OUTCOME_AUTH_FAILED, SET_KEY_OUTCOME_CONNECTED, SET_KEY_OUTCOME_EMPTY_CATALOG,
    SET_KEY_OUTCOME_NOT_COMPATIBLE, SET_KEY_OUTCOME_RATE_LIMITED, SET_KEY_OUTCOME_STORE_FAILED,
    SET_KEY_OUTCOME_UNREACHABLE, SetKeyResult,
};
use crate::provider::registry::provider_descriptor;
use crate::provider::{ModelInfo, ProviderId, ValidationOutcome};
use crate::secrets::ApiKey;
use crate::store::{ActiveSelection, ProviderSettings, Store};

const CHAT_INCAPABLE_MARKERS: [&str; 6] =
    ["embed", "moderation", "tts", "whisper", "dall-e", "rerank"];

pub(super) fn persist_connected_provider(
    store: &Store,
    work: &SetKeyWork,
    models: &[ModelInfo],
    set_key: impl FnOnce(ProviderId, &ApiKey) -> Result<(), crate::secrets::KeychainError>,
) -> Result<SetKeyResult, ()> {
    store
        .upsert_provider_settings(&ProviderSettings {
            provider: work.provider,
            base_url: work.base_url.clone(),
            label: work.label.clone(),
            key_present: false,
            last_connected_at: Some(now_ms()),
        })
        .map_err(|_| ())?;
    set_key(work.provider, &work.key).map_err(|_| ())?;
    // Sanitize the provider-supplied id on this boundary too: the connect path
    // both persists it as the active model and returns it to the TUI, so it
    // must be scrubbed of control/ANSI sequences exactly like `list_models`.
    let selected_model =
        select_default_model(work.provider, models).map(super::sanitize::sanitize_model_id);
    if let Some(model_id) = &selected_model {
        store
            .set_active_selection(&ActiveSelection {
                provider: work.provider,
                model_id: model_id.clone(),
            })
            .map_err(|_| ())?;
    }
    store.set_key_present(work.provider, true).map_err(|_| ())?;
    Ok(SetKeyResult {
        outcome: SET_KEY_OUTCOME_CONNECTED,
        selected_model,
    })
}

pub(super) fn persist_session_only(
    work: &SetKeyWork,
    models: &[ModelInfo],
    set_key: impl FnOnce(ProviderId, &ApiKey) -> Result<(), crate::secrets::KeychainError>,
) -> Result<SetKeyResult, ()> {
    if work.provider != ProviderId::Kimi {
        return Err(());
    }
    set_key(work.provider, &work.key).map_err(|_| ())?;
    let selected_model =
        select_default_model(work.provider, models).map(super::sanitize::sanitize_model_id);
    Ok(SetKeyResult {
        outcome: SET_KEY_OUTCOME_CONNECTED,
        selected_model,
    })
}

pub(super) fn set_key_outcome(outcome: &ValidationOutcome) -> &'static str {
    match outcome {
        ValidationOutcome::Connected(_) => SET_KEY_OUTCOME_CONNECTED,
        ValidationOutcome::AuthFailed => SET_KEY_OUTCOME_AUTH_FAILED,
        ValidationOutcome::RateLimited => SET_KEY_OUTCOME_RATE_LIMITED,
        ValidationOutcome::Unreachable => SET_KEY_OUTCOME_UNREACHABLE,
        ValidationOutcome::NotCompatible => SET_KEY_OUTCOME_NOT_COMPATIBLE,
        ValidationOutcome::EmptyCatalog => SET_KEY_OUTCOME_EMPTY_CATALOG,
    }
}

pub(super) fn select_default_model(provider: ProviderId, models: &[ModelInfo]) -> Option<&str> {
    let default = provider_descriptor(provider).default_model;
    default
        .and_then(|id| models.iter().find(|model| model.id == id))
        .or_else(|| models.iter().find(|model| is_chat_capable(&model.id)))
        .or_else(|| models.first())
        .map(|model| model.id.as_str())
}

pub(super) fn store_failed() -> SetKeyResult {
    SetKeyResult {
        outcome: SET_KEY_OUTCOME_STORE_FAILED,
        selected_model: None,
    }
}

fn is_chat_capable(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    !CHAT_INCAPABLE_MARKERS
        .iter()
        .any(|marker| lower.contains(marker))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
