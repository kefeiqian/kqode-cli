use super::*;

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
