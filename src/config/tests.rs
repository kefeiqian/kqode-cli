use super::*;
use crate::test_env;
use std::sync::MutexGuard;

// Environment mutation is process-global; serialize env-touching tests.
fn env_guard() -> MutexGuard<'static, ()> {
    test_env::lock()
}

fn clear() {
    for var in [CUSTOM_API_KEY_VAR, CUSTOM_MODEL_VAR, CUSTOM_BASE_URL_VAR] {
        unsafe { env::remove_var(var) };
    }
}

#[test]
fn custom_env_model_is_none_when_unset() {
    let _guard = env_guard();
    clear();
    assert_eq!(custom_env_model(), None);
}

#[test]
fn custom_env_model_reads_and_trims_the_value() {
    let _guard = env_guard();
    clear();
    unsafe { env::set_var(CUSTOM_MODEL_VAR, "  my-model  ") };
    assert_eq!(custom_env_model().as_deref(), Some("my-model"));
    clear();
}

#[test]
fn custom_env_model_treats_blank_as_unset() {
    let _guard = env_guard();
    clear();
    unsafe { env::set_var(CUSTOM_MODEL_VAR, "   ") };
    assert_eq!(custom_env_model(), None);
    clear();
}

#[test]
fn custom_env_base_url_reads_and_trims_the_value() {
    let _guard = env_guard();
    clear();
    unsafe { env::set_var(CUSTOM_BASE_URL_VAR, "  https://models.example/v1  ") };
    assert_eq!(
        custom_env_base_url().as_deref(),
        Some("https://models.example/v1")
    );
    clear();
}

#[test]
fn custom_env_base_url_is_none_when_unset() {
    let _guard = env_guard();
    clear();
    assert_eq!(custom_env_base_url(), None);
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
