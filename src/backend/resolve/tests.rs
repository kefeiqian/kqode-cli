use super::*;
use crate::config::{DEFAULT_KIMI_BASE_URL, DEFAULT_KIMI_MODEL};
use crate::secrets::{ApiKey, clear_key, set_key};
use crate::store::{ActiveSelection, ProviderSettings};
use crate::test_env;
use std::sync::{MutexGuard, Once};

static KEYRING_MOCK: Once = Once::new();

struct IsolatedState {
    dir: tempfile::TempDir,
    _lock: MutexGuard<'static, ()>,
}

impl IsolatedState {
    fn new() -> Self {
        let lock = test_env::lock();
        KEYRING_MOCK.call_once(|| {
            keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
        });
        let state = Self {
            dir: tempfile::tempdir().expect("temp dir"),
            _lock: lock,
        };
        state.clear();
        state
    }

    fn store(&self) -> Store {
        Store::open_or_bootstrap_at(self.dir.path().join("kqode.db")).expect("bootstrap")
    }

    fn clear(&self) {
        clear_key(ProviderId::Kimi).unwrap();
        clear_key(ProviderId::Custom).unwrap();
    }
}

impl Drop for IsolatedState {
    fn drop(&mut self) {
        self.clear();
    }
}

#[test]
fn active_selection_with_resolvable_key_returns_selected_provider_model_and_url() {
    let state = IsolatedState::new();
    let store = state.store();
    set_key(
        ProviderId::Custom,
        &ApiKey::new("sk-custom-active".to_owned()),
    )
    .unwrap();
    store
        .upsert_provider_settings(&ProviderSettings {
            provider: ProviderId::Custom,
            base_url: "https://custom.example/v1".to_owned(),
            label: Some("Custom".to_owned()),
            key_present: true,
            last_connected_at: None,
        })
        .unwrap();
    store
        .set_active_selection(&ActiveSelection {
            provider: ProviderId::Custom,
            model_id: "custom-model".to_owned(),
        })
        .unwrap();

    let config = resolve_submit_config(&store).expect("resolved config");

    assert_eq!(config.api_key, "sk-custom-active");
    assert_eq!(config.model, "custom-model");
    assert_eq!(config.base_url, "https://custom.example/v1");
}

#[test]
fn kimi_keychain_default_uses_fixed_base_url() {
    let state = IsolatedState::new();
    let store = state.store();
    set_key(
        ProviderId::Kimi,
        &ApiKey::new("sk-keychain-kimi".to_owned()),
    )
    .unwrap();

    let config = resolve_submit_config(&store).expect("effective default");

    assert_eq!(config.api_key, "sk-keychain-kimi");
    assert_eq!(config.model, DEFAULT_KIMI_MODEL);
    assert_eq!(config.base_url, DEFAULT_KIMI_BASE_URL);
}

#[test]
fn custom_keychain_settings_are_not_auto_selected_without_active_choice() {
    let state = IsolatedState::new();
    let store = state.store();
    set_key(
        ProviderId::Custom,
        &ApiKey::new("sk-keychain-custom".to_owned()),
    )
    .unwrap();
    store
        .upsert_provider_settings(&ProviderSettings {
            provider: ProviderId::Custom,
            base_url: "https://custom.example/v1".to_owned(),
            label: None,
            key_present: true,
            last_connected_at: None,
        })
        .unwrap();

    assert!(resolve_submit_config(&store).is_none());
}

#[test]
fn active_provider_without_key_returns_none_even_when_another_provider_resolves() {
    let state = IsolatedState::new();
    let store = state.store();
    set_key(
        ProviderId::Kimi,
        &ApiKey::new("sk-keychain-kimi".to_owned()),
    )
    .unwrap();
    store
        .upsert_provider_settings(&ProviderSettings {
            provider: ProviderId::Custom,
            base_url: "https://custom.example/v1".to_owned(),
            label: None,
            key_present: false,
            last_connected_at: None,
        })
        .unwrap();
    store
        .set_active_selection(&ActiveSelection {
            provider: ProviderId::Custom,
            model_id: "custom-model".to_owned(),
        })
        .unwrap();

    assert!(resolve_submit_config(&store).is_none());
}

#[test]
fn nothing_configured_returns_none() {
    let state = IsolatedState::new();
    let store = state.store();

    assert!(resolve_submit_config(&store).is_none());
}
