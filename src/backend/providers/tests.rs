use super::*;
use crate::paths::KQODE_DB_PATH_VAR;
use crate::test_env;
use std::env;
use std::sync::MutexGuard;

struct EnvGuard {
    db_path: Option<std::ffi::OsString>,
    kimi_key: Option<std::ffi::OsString>,
    _lock: MutexGuard<'static, ()>,
}

impl EnvGuard {
    fn new(db_path: &std::path::Path, lock: MutexGuard<'static, ()>) -> Self {
        let guard = Self {
            db_path: env::var_os(KQODE_DB_PATH_VAR),
            kimi_key: env::var_os(KIMI_API_KEY_VAR),
            _lock: lock,
        };
        unsafe {
            env::set_var(KQODE_DB_PATH_VAR, db_path);
            env::remove_var(KIMI_API_KEY_VAR);
        }
        guard
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        restore_env(KQODE_DB_PATH_VAR, self.db_path.as_ref());
        restore_env(KIMI_API_KEY_VAR, self.kimi_key.as_ref());
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
    let guard = EnvGuard::new(&dir.path().join("kqode.db"), lock);
    let store = Store::open_or_bootstrap().expect("bootstrap");
    (dir, store, guard)
}

#[test]
fn set_active_selection_core_round_trips() {
    let (_dir, store, _env) = bootstrap();
    let result = set_active_selection(
        Some(&store),
        SelectionSetParams {
            provider_id: "kimi".to_owned(),
            model_id: "kimi-k2.7-code".to_owned(),
        },
    );
    assert!(result.ok);
    let selection = active_selection(Some(&store));
    assert_eq!(selection.provider_id.as_deref(), Some("kimi"));
    assert_eq!(selection.model_id.as_deref(), Some("kimi-k2.7-code"));
}

#[test]
fn active_selection_core_is_null_when_unset() {
    let (_dir, store, _env) = bootstrap();
    let result = active_selection(Some(&store));
    assert_eq!(result.provider_id, None);
    assert_eq!(result.model_id, None);
}

#[test]
fn provider_list_empty_store_without_env_marks_kimi_not_configured() {
    let (_dir, store, _env) = bootstrap();
    let result = provider_list(Some(&store));
    assert!(result.persistence_available);
    let kimi = result
        .providers
        .iter()
        .find(|row| row.provider_id == "kimi")
        .unwrap();
    assert_eq!(kimi.status, PROVIDER_STATUS_NOT_CONFIGURED);
    assert_eq!(kimi.credential_source, None);
}

#[test]
fn provider_list_without_store_reports_degraded_persistence() {
    let lock = test_env::lock();
    let dir = tempfile::tempdir().expect("temp dir");
    let _guard = EnvGuard::new(&dir.path().join("unused.db"), lock);
    let result = provider_list(None);
    assert!(!result.persistence_available);
}

#[test]
fn provider_list_without_store_reports_kimi_keychain_status() {
    let lock = test_env::lock();
    let dir = tempfile::tempdir().expect("temp dir");
    let _guard = EnvGuard::new(&dir.path().join("unused.db"), lock);
    crate::secrets::clear_key(ProviderId::Kimi).unwrap();
    crate::secrets::set_key(
        ProviderId::Kimi,
        &crate::secrets::ApiKey::new("sk-degraded-kimi".to_owned()),
    )
    .unwrap();

    let result = provider_list(None);
    let kimi = result
        .providers
        .iter()
        .find(|row| row.provider_id == "kimi")
        .unwrap();

    assert_eq!(kimi.status, PROVIDER_STATUS_CONNECTED);
    assert_eq!(kimi.credential_source, Some(CREDENTIAL_SOURCE_KEYCHAIN));
    crate::secrets::clear_key(ProviderId::Kimi).unwrap();
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
    let result = provider_list(Some(&store));
    let kimi = result
        .providers
        .iter()
        .find(|row| row.provider_id == "kimi")
        .unwrap();
    assert_eq!(kimi.status, PROVIDER_STATUS_CONNECTED);
    assert_eq!(kimi.credential_source, Some(CREDENTIAL_SOURCE_KEYCHAIN));
}
