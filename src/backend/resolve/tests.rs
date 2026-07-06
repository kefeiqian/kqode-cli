use super::*;
use crate::config::{
    CUSTOM_API_KEY_VAR, CUSTOM_BASE_URL_VAR, CUSTOM_MODEL_VAR, DEFAULT_KIMI_BASE_URL,
    DEFAULT_KIMI_MODEL,
};
use crate::paths::KQODE_DB_PATH_VAR;
use crate::secrets::{ApiKey, clear_key, set_key};
use crate::store::{ActiveSelection, ProviderSettings};
use crate::test_env;
use std::env;
use std::ffi::OsString;
use std::sync::{MutexGuard, Once};

static KEYRING_MOCK: Once = Once::new();

struct IsolatedState {
    dir: tempfile::TempDir,
    db_path: Option<OsString>,
    custom_key: Option<OsString>,
    custom_model: Option<OsString>,
    custom_base_url: Option<OsString>,
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
            db_path: env::var_os(KQODE_DB_PATH_VAR),
            custom_key: env::var_os(CUSTOM_API_KEY_VAR),
            custom_model: env::var_os(CUSTOM_MODEL_VAR),
            custom_base_url: env::var_os(CUSTOM_BASE_URL_VAR),
            _lock: lock,
        };
        unsafe {
            env::set_var(KQODE_DB_PATH_VAR, state.dir.path().join("kqode.db"));
        }
        state.clear();
        state
    }

    fn store(&self) -> Store {
        Store::open_or_bootstrap().expect("bootstrap")
    }

    fn clear(&self) {
        clear_key(ProviderId::Kimi).unwrap();
        clear_key(ProviderId::Custom).unwrap();
        unsafe {
            env::remove_var(CUSTOM_API_KEY_VAR);
            env::remove_var(CUSTOM_MODEL_VAR);
            env::remove_var(CUSTOM_BASE_URL_VAR);
        }
    }
}

impl Drop for IsolatedState {
    fn drop(&mut self) {
        self.clear();
        restore(KQODE_DB_PATH_VAR, self.db_path.as_ref());
        restore(CUSTOM_API_KEY_VAR, self.custom_key.as_ref());
        restore(CUSTOM_MODEL_VAR, self.custom_model.as_ref());
        restore(CUSTOM_BASE_URL_VAR, self.custom_base_url.as_ref());
    }
}

fn restore(name: &str, value: Option<&OsString>) {
    unsafe {
        if let Some(value) = value {
            env::set_var(name, value);
        } else {
            env::remove_var(name);
        }
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

    let config = resolve_submit_config(Some(&store)).expect("resolved config");

    assert_eq!(config.api_key, "sk-custom-active");
    assert_eq!(config.model, "custom-model");
    assert_eq!(config.base_url, "https://custom.example/v1");
}

#[test]
fn no_active_row_uses_custom_env_default() {
    let state = IsolatedState::new();
    let store = state.store();
    unsafe {
        env::set_var(CUSTOM_API_KEY_VAR, "sk-env-custom");
        env::set_var(CUSTOM_MODEL_VAR, "env-model");
        env::set_var(CUSTOM_BASE_URL_VAR, "https://models.example/v1");
    }

    let config = resolve_submit_config(Some(&store)).expect("effective default");

    assert_eq!(config.api_key, "sk-env-custom");
    assert_eq!(config.model, "env-model");
    assert_eq!(config.base_url, "https://models.example/v1");
}

#[test]
fn custom_env_base_url_must_be_https_or_submit_needs_config() {
    let state = IsolatedState::new();
    let store = state.store();
    unsafe {
        env::set_var(CUSTOM_API_KEY_VAR, "sk-env-custom");
        env::set_var(CUSTOM_MODEL_VAR, "env-model");
        env::set_var(CUSTOM_BASE_URL_VAR, "http://insecure.example/v1");
    }

    assert!(resolve_submit_config(Some(&store)).is_none());
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

    let config = resolve_submit_config(Some(&store)).expect("effective default");

    assert_eq!(config.api_key, "sk-keychain-kimi");
    assert_eq!(config.model, DEFAULT_KIMI_MODEL);
    assert_eq!(config.base_url, DEFAULT_KIMI_BASE_URL);
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

    assert!(resolve_submit_config(Some(&store)).is_none());
}

#[test]
fn nothing_configured_returns_none() {
    let state = IsolatedState::new();
    let store = state.store();

    assert!(resolve_submit_config(Some(&store)).is_none());
}
