use rusqlite::Connection;

use super::credentials::redact_api_key;
use super::{LlmSettings, Provider, SettingsError, SettingsStore};
use kqode_provider::{DEEPSEEK_API_BASE_URL, KIMI_API_BASE_URL};

#[test]
fn saves_and_loads_llm_settings() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let settings = LlmSettings {
        provider: Provider::Kimi,
        api_base_url: KIMI_API_BASE_URL.to_owned(),
        api_key: "secret-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: Vec::new(),
        model: "kimi-k2.7-code".to_owned(),
    };

    store.save_settings(&settings).unwrap();

    let mut expected = settings;
    expected.api_key_preview = redact_api_key(&expected.api_key);
    assert_eq!(
        store.load_provider_settings(Provider::Kimi).unwrap(),
        expected
    );
}

#[test]
fn providers_have_no_default_model_without_an_api_key() {
    for provider in [
        Provider::Kimi,
        Provider::Openai,
        Provider::Anthropic,
        Provider::Deepseek,
        Provider::Copilot,
        Provider::CopilotSdk,
        Provider::Custom,
    ] {
        assert!(LlmSettings::for_provider(provider).model.is_empty());
    }
}

#[test]
fn deepseek_uses_the_official_api_without_a_default_model() {
    assert_eq!(
        LlmSettings::for_provider(Provider::Deepseek),
        LlmSettings {
            provider: Provider::Deepseek,
            api_base_url: DEEPSEEK_API_BASE_URL.to_owned(),
            api_key: String::new(),
            api_key_preview: String::new(),
            highlighted_models: Vec::new(),
            model: String::new(),
        }
    );
}

#[test]
fn copilot_requires_a_model_but_not_an_api_key() {
    let settings = LlmSettings::for_provider(Provider::Copilot);

    assert!(settings.api_key.is_empty());
    assert!(settings.api_base_url.is_empty());
    assert!(settings.model.is_empty());
    assert!(!settings.provider.requires_api_key());
    assert!(settings.provider.requires_model());
}

#[test]
fn copilot_sdk_requires_a_model_but_not_an_api_key() {
    let settings = LlmSettings::for_provider(Provider::CopilotSdk);

    assert!(settings.api_key.is_empty());
    assert!(settings.api_base_url.is_empty());
    assert!(settings.model.is_empty());
    assert!(!settings.provider.requires_api_key());
    assert!(settings.provider.requires_model());
}

#[test]
fn copilot_sdk_uses_the_stable_wire_identifier() {
    assert_eq!(
        serde_json::to_string(&Provider::CopilotSdk).unwrap(),
        r#""copilot_sdk""#
    );
    assert_eq!(
        serde_json::from_str::<Provider>(r#""copilot_sdk""#).unwrap(),
        Provider::CopilotSdk
    );
}

#[test]
fn copilot_can_save_a_model_without_an_api_key() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let settings = LlmSettings {
        provider: Provider::Copilot,
        api_base_url: String::new(),
        api_key: String::new(),
        api_key_preview: String::new(),
        highlighted_models: vec!["gpt-test".to_owned()],
        model: "gpt-test".to_owned(),
    };

    store.save_settings(&settings).unwrap();

    assert_eq!(
        store.load_provider_settings(Provider::Copilot).unwrap(),
        settings
    );
}

#[test]
fn copilot_sdk_settings_are_independent_from_copilot_cli() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let cli = LlmSettings {
        provider: Provider::Copilot,
        api_base_url: String::new(),
        api_key: String::new(),
        api_key_preview: String::new(),
        highlighted_models: vec!["cli-model".to_owned()],
        model: "cli-model".to_owned(),
    };
    let sdk = LlmSettings {
        provider: Provider::CopilotSdk,
        api_base_url: String::new(),
        api_key: String::new(),
        api_key_preview: String::new(),
        highlighted_models: vec!["sdk-model".to_owned()],
        model: "sdk-model".to_owned(),
    };

    store.save_settings(&cli).unwrap();
    store.save_settings(&sdk).unwrap();

    assert_eq!(
        store.load_provider_settings(Provider::Copilot).unwrap(),
        cli
    );
    assert_eq!(
        store.load_provider_settings(Provider::CopilotSdk).unwrap(),
        sdk
    );
}

#[test]
fn empty_api_key_discards_the_selected_model() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    store
        .save_settings(&LlmSettings {
            provider: Provider::Kimi,
            api_base_url: KIMI_API_BASE_URL.to_owned(),
            api_key: String::new(),
            api_key_preview: String::new(),
            highlighted_models: Vec::new(),
            model: "kimi-k2.6".to_owned(),
        })
        .unwrap();

    assert!(
        store
            .load_provider_settings(Provider::Kimi)
            .unwrap()
            .model
            .is_empty()
    );
}

#[test]
fn preserves_a_model_returned_by_the_remote_api() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let settings = LlmSettings {
        provider: Provider::Kimi,
        api_base_url: KIMI_API_BASE_URL.to_owned(),
        api_key: "secret-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: Vec::new(),
        model: "future-kimi-model".to_owned(),
    };

    store.save_settings(&settings).unwrap();

    let mut expected = settings;
    expected.api_key_preview = redact_api_key(&expected.api_key);
    assert_eq!(
        store.load_provider_settings(Provider::Kimi).unwrap(),
        expected
    );
}

#[test]
fn caches_models_for_twenty_four_hours() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let models = vec!["kimi-k3".to_owned()];
    let fetched_at = 1_000_000;

    let cache_key = format!("kimi:{KIMI_API_BASE_URL}");
    store
        .cache_models_at(&cache_key, &models, fetched_at)
        .unwrap();

    assert_eq!(
        store
            .cached_models_at(&cache_key, fetched_at + 86_399)
            .unwrap(),
        Some(models)
    );
    assert_eq!(
        store
            .cached_models_at(&cache_key, fetched_at + 86_400)
            .unwrap(),
        None
    );
}

#[test]
fn changing_api_key_invalidates_model_cache() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut settings = LlmSettings {
        provider: Provider::Kimi,
        api_base_url: KIMI_API_BASE_URL.to_owned(),
        api_key: "first-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: Vec::new(),
        model: "kimi-k3".to_owned(),
    };
    store.save_settings(&settings).unwrap();
    let cache_key = format!("kimi:{KIMI_API_BASE_URL}");
    store
        .cache_models_at(&cache_key, &["kimi-k3".to_owned()], 1_000_000)
        .unwrap();

    settings.api_key = "second-key".to_owned();
    store.save_settings(&settings).unwrap();

    assert_eq!(store.cached_models_at(&cache_key, 1_000_001).unwrap(), None);
}

#[test]
fn saves_and_loads_custom_api_base_url() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let settings = LlmSettings {
        provider: Provider::Custom,
        api_base_url: "https://llm.example.com/v1".to_owned(),
        api_key: "secret-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: Vec::new(),
        model: "example-model".to_owned(),
    };

    store.save_settings(&settings).unwrap();

    let mut expected = settings;
    expected.api_key_preview = redact_api_key(&expected.api_key);
    assert_eq!(
        store.load_provider_settings(Provider::Custom).unwrap(),
        expected
    );
}

#[test]
fn rejects_insecure_custom_api_base_url() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let error = store
        .save_settings(&LlmSettings {
            provider: Provider::Custom,
            api_base_url: "http://llm.example.com/v1".to_owned(),
            api_key: "secret-key".to_owned(),
            api_key_preview: String::new(),
            highlighted_models: Vec::new(),
            model: "example-model".to_owned(),
        })
        .unwrap_err();

    assert!(matches!(error, SettingsError::Configuration(_)));
}

#[test]
fn uses_provider_default_url_for_an_empty_stored_url() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    store
        .connection
        .execute(
            "INSERT INTO provider_settings (
                provider, api_base_url, key_present, highlighted_models_json, model
             ) VALUES ('kimi', '', 0, '[]', 'kimi-k3')",
            [],
        )
        .unwrap();
    let settings = store.load_provider_settings(Provider::Kimi).unwrap();

    assert_eq!(settings.api_base_url, KIMI_API_BASE_URL);
}

#[test]
fn preserves_a_key_when_saving_its_redacted_preview() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let settings = LlmSettings {
        provider: Provider::Kimi,
        api_base_url: KIMI_API_BASE_URL.to_owned(),
        api_key: "sk-example-secret".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: Vec::new(),
        model: "kimi-k3".to_owned(),
    };
    store.save_settings(&settings).unwrap();

    let mut redacted = store.load_provider_settings(Provider::Kimi).unwrap();
    redacted.api_key.clear();
    store.save_settings(&redacted).unwrap();

    assert_eq!(
        store
            .load_provider_settings(Provider::Kimi)
            .unwrap()
            .api_key,
        "sk-example-secret"
    );
}

#[test]
fn serialized_settings_omit_the_api_key() {
    let settings = LlmSettings {
        provider: Provider::Kimi,
        api_base_url: KIMI_API_BASE_URL.to_owned(),
        api_key: "sk-example-secret".to_owned(),
        api_key_preview: "sk-e[redacted]cret".to_owned(),
        highlighted_models: Vec::new(),
        model: "kimi-k3".to_owned(),
    };

    let serialized = serde_json::to_value(settings).unwrap();

    assert_eq!(serialized["apiKey"], "");
    assert_eq!(serialized["apiKeyPreview"], "sk-e[redacted]cret");
}

#[test]
fn keeps_independent_settings_for_each_provider() {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let kimi = LlmSettings {
        provider: Provider::Kimi,
        api_base_url: KIMI_API_BASE_URL.to_owned(),
        api_key: "kimi-secret-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: vec!["kimi-k3".to_owned()],
        model: "kimi-k3".to_owned(),
    };
    let openai = LlmSettings {
        provider: Provider::Openai,
        api_base_url: "https://api.openai.com/v1".to_owned(),
        api_key: "openai-secret-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: vec!["gpt-test".to_owned()],
        model: "gpt-test".to_owned(),
    };

    store.save_settings(&kimi).unwrap();
    store.save_settings(&openai).unwrap();

    let loaded_kimi = store.load_provider_settings(Provider::Kimi).unwrap();
    let loaded_openai = store.load_provider_settings(Provider::Openai).unwrap();
    assert_eq!(loaded_kimi.api_key, kimi.api_key);
    assert_eq!(loaded_kimi.highlighted_models, kimi.highlighted_models);
    assert_eq!(loaded_openai.api_key, openai.api_key);
    assert_eq!(loaded_openai.highlighted_models, openai.highlighted_models);
}
