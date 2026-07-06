use super::*;
use crate::test_env;
use std::sync::MutexGuard;

// Environment mutation is process-global; serialize env-touching tests.
fn env_guard() -> MutexGuard<'static, ()> {
    test_env::lock()
}

fn clear() {
    for var in [KIMI_API_KEY_VAR, KIMI_MODEL_VAR, KIMI_BASE_URL_VAR] {
        unsafe { env::remove_var(var) };
    }
}

#[test]
fn missing_key_is_an_error() {
    let _guard = env_guard();
    clear();
    assert_eq!(
        KimiConfig::from_env().unwrap_err(),
        ConfigError::MissingApiKey
    );
}

#[test]
fn blank_key_counts_as_missing() {
    let _guard = env_guard();
    clear();
    unsafe { env::set_var(KIMI_API_KEY_VAR, "   ") };
    assert_eq!(
        KimiConfig::from_env().unwrap_err(),
        ConfigError::MissingApiKey
    );
    clear();
}

#[test]
fn defaults_apply_when_only_key_is_set() {
    let _guard = env_guard();
    clear();
    unsafe { env::set_var(KIMI_API_KEY_VAR, "secret-token") };
    let config = KimiConfig::from_env().unwrap();
    assert_eq!(config.api_key, "secret-token");
    assert_eq!(config.model, DEFAULT_KIMI_MODEL);
    assert_eq!(config.base_url, DEFAULT_KIMI_BASE_URL);
    clear();
}

#[test]
fn overrides_and_trailing_slash_trim_apply() {
    let _guard = env_guard();
    clear();
    unsafe {
        env::set_var(KIMI_API_KEY_VAR, "secret-token");
        env::set_var(KIMI_MODEL_VAR, "kimi-k2.6");
        env::set_var(KIMI_BASE_URL_VAR, "https://api.moonshot.ai/v1/");
    }
    let config = KimiConfig::from_env().unwrap();
    assert_eq!(config.model, "kimi-k2.6");
    assert_eq!(config.base_url, "https://api.moonshot.ai/v1");
    clear();
}

#[test]
fn debug_redacts_the_api_key() {
    let config = KimiConfig {
        api_key: "super-secret-token".to_owned(),
        model: DEFAULT_KIMI_MODEL.to_owned(),
        base_url: DEFAULT_KIMI_BASE_URL.to_owned(),
    };
    let rendered = format!("{config:?}");
    assert!(!rendered.contains("super-secret-token"), "{rendered}");
    assert!(rendered.contains("<redacted>"), "{rendered}");
}
