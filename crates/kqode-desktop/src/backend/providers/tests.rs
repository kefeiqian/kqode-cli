use super::*;
use crate::test_env;
use std::env;
use std::sync::MutexGuard;

const CUSTOM_KEY_VAR: &str = concat!("CUSTOM_", "API_KEY");
const CUSTOM_PROVIDER_MODEL_VAR: &str = concat!("CUSTOM_", "MODEL");
const CUSTOM_BASE_ENV_VAR: &str = concat!("CUSTOM_", "BASE_URL");

struct EnvGuard {
    custom_key: Option<std::ffi::OsString>,
    custom_model: Option<std::ffi::OsString>,
    custom_base_url: Option<std::ffi::OsString>,
    _lock: MutexGuard<'static, ()>,
}

impl EnvGuard {
    fn new(lock: MutexGuard<'static, ()>) -> Self {
        let guard = Self {
            custom_key: env::var_os(CUSTOM_KEY_VAR),
            custom_model: env::var_os(CUSTOM_PROVIDER_MODEL_VAR),
            custom_base_url: env::var_os(CUSTOM_BASE_ENV_VAR),
            _lock: lock,
        };
        unsafe {
            env::remove_var(CUSTOM_KEY_VAR);
            env::remove_var(CUSTOM_PROVIDER_MODEL_VAR);
            env::remove_var(CUSTOM_BASE_ENV_VAR);
        }
        guard
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        restore_env(CUSTOM_KEY_VAR, self.custom_key.as_ref());
        restore_env(CUSTOM_PROVIDER_MODEL_VAR, self.custom_model.as_ref());
        restore_env(CUSTOM_BASE_ENV_VAR, self.custom_base_url.as_ref());
    }
}

fn restore_env(name: &str, value: Option<&std::ffi::OsString>) {
    unsafe {
        if let Some(value) = value {
            env::set_var(name, value);
        } else {
            env::remove_var(name);
        }
    }
}

fn bootstrap() -> (tempfile::TempDir, Store, EnvGuard) {
    let lock = test_env::lock();
    let dir = tempfile::tempdir().expect("temp dir");
    let guard = EnvGuard::new(lock);
    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).expect("bootstrap");
    (dir, store, guard)
}

#[test]
fn set_active_selection_core_round_trips() {
    let (_dir, store, _env) = bootstrap();
    let result = set_active_selection(
        &store,
        SelectionSetParams {
            provider_id: "kimi".to_owned(),
            model_id: "kimi-k2.7-code".to_owned(),
        },
    );
    assert!(result.ok);
    let selection = active_selection(&store);
    assert_eq!(selection.provider_id.as_deref(), Some("kimi"));
    assert_eq!(selection.model_id.as_deref(), Some("kimi-k2.7-code"));
}

#[test]
fn active_selection_core_is_null_when_unset() {
    let (_dir, store, _env) = bootstrap();
    let result = active_selection(&store);
    assert_eq!(result.provider_id, None);
    assert_eq!(result.model_id, None);
}

#[test]
fn provider_list_empty_store_marks_kimi_not_configured() {
    let (_dir, store, _env) = bootstrap();
    let result = provider_list(&store);
    let kimi = result
        .providers
        .iter()
        .find(|row| row.provider_id == "kimi")
        .unwrap();
    assert_eq!(kimi.status, PROVIDER_STATUS_NOT_CONFIGURED);
    assert_eq!(kimi.credential_source, None);
    assert_eq!(
        kimi.default_model.as_deref(),
        Some(crate::config::DEFAULT_KIMI_MODEL)
    );
}

#[test]
fn provider_list_uses_cached_key_present_bit_for_keychain_status() {
    let (_dir, store, _env) = bootstrap();
    store
        .upsert_provider_settings(&ProviderSettings {
            provider: ProviderId::Kimi,
            base_url: "https://api.moonshot.cn/v1".to_owned(),
            label: Some("Kimi".to_owned()),
            key_present: true,
            last_connected_at: None,
        })
        .unwrap();
    let result = provider_list(&store);
    let kimi = result
        .providers
        .iter()
        .find(|row| row.provider_id == "kimi")
        .unwrap();
    assert_eq!(kimi.status, PROVIDER_STATUS_CONNECTED);
    assert_eq!(kimi.credential_source, Some(CREDENTIAL_SOURCE_KEYCHAIN));
}

#[test]
fn clear_provider_key_clears_store_bit_after_keychain_delete() {
    let (_dir, store, _env) = bootstrap();
    seed_kimi_key_present(&store);

    let result = clear_provider_key_with(&store, ProviderId::Kimi, |_provider| Ok(()));

    assert!(result.ok);
    assert!(
        !store
            .provider_settings(ProviderId::Kimi)
            .unwrap()
            .unwrap()
            .key_present
    );
}

#[test]
fn clear_provider_key_leaves_store_bit_when_keychain_unavailable() {
    let (_dir, store, _env) = bootstrap();
    seed_kimi_key_present(&store);

    let result = clear_provider_key_with(&store, ProviderId::Kimi, |_provider| {
        Err(KeychainError::Unavailable)
    });

    assert!(!result.ok);
    assert!(
        store
            .provider_settings(ProviderId::Kimi)
            .unwrap()
            .unwrap()
            .key_present
    );
}

#[test]
fn provider_list_ignores_custom_environment_configuration() {
    let (_dir, store, _env) = bootstrap();
    unsafe {
        env::set_var(CUSTOM_KEY_VAR, "sk-env-custom");
        env::set_var(CUSTOM_PROVIDER_MODEL_VAR, "env-model");
        env::set_var(CUSTOM_BASE_ENV_VAR, "https://models.example/v1");
    }

    let result = provider_list(&store);

    let custom = result
        .providers
        .iter()
        .find(|row| row.provider_id == "custom")
        .unwrap();
    assert_eq!(custom.status, PROVIDER_STATUS_NOT_CONFIGURED);
    assert_eq!(custom.credential_source, None);
    assert_eq!(custom.default_model, None);
    assert_eq!(custom.base_url, None);
}

#[test]
fn provider_list_marks_custom_not_configured_without_settings() {
    let (_dir, store, _env) = bootstrap();

    let result = provider_list(&store);

    let custom = result
        .providers
        .iter()
        .find(|row| row.provider_id == "custom")
        .unwrap();
    assert_eq!(custom.status, PROVIDER_STATUS_NOT_CONFIGURED);
    assert_eq!(custom.credential_source, None);
    assert_eq!(custom.base_url, None);
}

#[test]
fn provider_list_gates_custom_key_present_without_base_url() {
    assert_eq!(
        gate_status_on_base_url(
            ProviderId::Custom,
            ProviderStatus::Connected(CredentialSource::Keychain),
            None,
        ),
        ProviderStatus::NotConfigured
    );
}

fn seed_kimi_key_present(store: &Store) {
    store
        .upsert_provider_settings(&ProviderSettings {
            provider: ProviderId::Kimi,
            base_url: "https://api.moonshot.cn/v1".to_owned(),
            label: Some("Kimi".to_owned()),
            key_present: true,
            last_connected_at: None,
        })
        .unwrap();
}
