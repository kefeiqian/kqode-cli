use super::*;
use crate::provider::registry::KeySource;
use crate::test_env;
use std::env;
use std::sync::{MutexGuard, Once};

static KEYRING_MOCK: Once = Once::new();

fn setup_mock() {
    KEYRING_MOCK.call_once(|| {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    });
}

fn with_isolated_state(test: impl FnOnce()) {
    let _guard = test_env::lock();
    setup_mock();
    let _state = IsolatedState::new(_guard);
    test();
}

struct IsolatedState {
    previous_env: Option<std::ffi::OsString>,
    _guard: MutexGuard<'static, ()>,
}

impl IsolatedState {
    fn new(guard: MutexGuard<'static, ()>) -> Self {
        let state = Self {
            previous_env: env::var_os(KIMI_API_KEY_VAR),
            _guard: guard,
        };
        state.clear();
        state
    }

    fn clear(&self) {
        clear_key(ProviderId::Kimi).unwrap();
        clear_key(ProviderId::Custom).unwrap();
        unsafe {
            env::remove_var(KIMI_API_KEY_VAR);
        }
    }
}

impl Drop for IsolatedState {
    fn drop(&mut self) {
        self.clear();
        unsafe {
            if let Some(value) = &self.previous_env {
                env::set_var(KIMI_API_KEY_VAR, value);
            } else {
                env::remove_var(KIMI_API_KEY_VAR);
            }
        }
    }
}

#[test]
fn set_then_get_returns_the_same_key() {
    with_isolated_state(|| {
        let key = ApiKey::new("sk-u5-round-trip".to_owned());
        set_key(ProviderId::Kimi, &key).unwrap();

        let stored = get_key(ProviderId::Kimi).unwrap().expect("stored key");

        assert_eq!(stored.expose(), "sk-u5-round-trip");
    });
}

#[test]
fn resolver_prefers_keychain_over_env() {
    with_isolated_state(|| {
        unsafe {
            env::set_var(KIMI_API_KEY_VAR, "sk-env-fallback");
        }
        set_key(ProviderId::Kimi, &ApiKey::new("sk-keychain".to_owned())).unwrap();

        assert_eq!(
            KeychainKeyResolver.key_source(ProviderId::Kimi),
            KeySource::Keychain
        );
        assert_eq!(
            resolve_key(ProviderId::Kimi).unwrap().expose(),
            "sk-keychain"
        );
    });
}

#[test]
fn clear_removes_only_the_selected_provider_key() {
    with_isolated_state(|| {
        set_key(ProviderId::Kimi, &ApiKey::new("sk-kimi".to_owned())).unwrap();
        set_key(ProviderId::Custom, &ApiKey::new("sk-custom".to_owned())).unwrap();

        clear_key(ProviderId::Kimi).unwrap();

        assert!(get_key(ProviderId::Kimi).unwrap().is_none());
        assert_eq!(
            get_key(ProviderId::Custom).unwrap().unwrap().expose(),
            "sk-custom"
        );
    });
}

#[test]
fn clear_does_not_touch_env_fallback() {
    with_isolated_state(|| {
        set_key(ProviderId::Kimi, &ApiKey::new("sk-keychain".to_owned())).unwrap();
        unsafe {
            env::set_var(KIMI_API_KEY_VAR, "sk-env-after-clear");
        }

        clear_key(ProviderId::Kimi).unwrap();

        assert_eq!(
            KeychainKeyResolver.key_source(ProviderId::Kimi),
            KeySource::Env
        );
        assert_eq!(
            resolve_key(ProviderId::Kimi).unwrap().expose(),
            "sk-env-after-clear"
        );
    });
}

#[test]
fn custom_has_no_env_fallback() {
    with_isolated_state(|| {
        unsafe {
            env::set_var(KIMI_API_KEY_VAR, "sk-env-only");
        }

        assert_eq!(
            KeychainKeyResolver.key_source(ProviderId::Custom),
            KeySource::None
        );
        assert!(resolve_key(ProviderId::Custom).is_none());
    });
}

#[test]
fn keychain_unavailable_maps_to_typed_error() {
    // The mock backend's errors are per-entry and our CRUD creates/cache entries
    // internally, so this directly covers the same sanitized mapper.
    let error = keyring::Error::NoStorageAccess(Box::new(std::io::Error::other("locked")));

    assert_eq!(map_keyring_error(error), KeychainError::Unavailable);
}

#[test]
fn api_key_debug_and_display_are_redacted() {
    let secret = "sk-u5-redaction-sentinel";
    let key = ApiKey::new(secret.to_owned());

    let debug = format!("{key:?}");
    let display = format!("{key}");

    assert!(!debug.contains(secret));
    assert!(!display.contains(secret));
    assert!(debug.contains(REDACTED));
    assert!(display.contains(REDACTED));
    // ApiKey intentionally has no Serialize impl; do not add one.
}
