use super::*;

#[test]
fn stores_and_clears_provider_keys_independently() {
    let store = SecretsStore::default();
    store
        .set_key(Provider::Kimi, &ApiKey::new("sk-kimi".to_owned()))
        .unwrap();
    store
        .set_key(Provider::Custom, &ApiKey::new("sk-custom".to_owned()))
        .unwrap();

    store.clear_key(Provider::Kimi).unwrap();

    assert!(store.get_key(Provider::Kimi).unwrap().is_none());
    assert_eq!(
        store.get_key(Provider::Custom).unwrap().unwrap().expose(),
        "sk-custom"
    );
}

#[test]
fn api_key_debug_and_display_are_redacted() {
    let secret = "sk-redaction-sentinel";
    let key = ApiKey::new(secret.to_owned());

    let debug = format!("{key:?}");
    let display = format!("{key}");

    assert!(!debug.contains(secret));
    assert!(!display.contains(secret));
    assert!(debug.contains(REDACTED));
    assert!(display.contains(REDACTED));
}
