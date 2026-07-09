use super::*;
use crate::login::sanitize::sanitize_model_id;
use crate::login::selection::{persist_connected_provider, select_default_model, set_key_outcome};
use crate::protocol::{
    SET_KEY_OUTCOME_AUTH_FAILED, SET_KEY_OUTCOME_CONNECTED, SET_KEY_OUTCOME_EMPTY_CATALOG,
    SET_KEY_OUTCOME_NOT_COMPATIBLE, SET_KEY_OUTCOME_RATE_LIMITED, SET_KEY_OUTCOME_UNREACHABLE,
};
use crate::provider::ModelInfo;

fn model(id: &str) -> ModelInfo {
    ModelInfo {
        id: id.to_owned(),
        owned_by: None,
    }
}

fn temp_store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).expect("store");
    (dir, store)
}

#[test]
fn picker_prefers_chat_capable_model() {
    let models = [model("text-embedding-3-large"), model("gpt-4o-mini")];
    assert_eq!(
        select_default_model(ProviderId::Custom, &models),
        Some("gpt-4o-mini")
    );
}

#[test]
fn picker_prefers_registry_default_when_present() {
    let models = [
        model("gpt-4o-mini"),
        model(crate::config::DEFAULT_KIMI_MODEL),
    ];
    assert_eq!(
        select_default_model(ProviderId::Kimi, &models),
        Some(crate::config::DEFAULT_KIMI_MODEL)
    );
}

#[test]
fn validation_outcomes_map_to_wire_outcomes() {
    assert_eq!(
        set_key_outcome(&ValidationOutcome::Connected(vec![model("chat")])),
        SET_KEY_OUTCOME_CONNECTED
    );
    assert_eq!(
        set_key_outcome(&ValidationOutcome::AuthFailed),
        SET_KEY_OUTCOME_AUTH_FAILED
    );
    assert_eq!(
        set_key_outcome(&ValidationOutcome::RateLimited),
        SET_KEY_OUTCOME_RATE_LIMITED
    );
    assert_eq!(
        set_key_outcome(&ValidationOutcome::Unreachable),
        SET_KEY_OUTCOME_UNREACHABLE
    );
    assert_eq!(
        set_key_outcome(&ValidationOutcome::NotCompatible),
        SET_KEY_OUTCOME_NOT_COMPATIBLE
    );
    assert_eq!(
        set_key_outcome(&ValidationOutcome::EmptyCatalog),
        SET_KEY_OUTCOME_EMPTY_CATALOG
    );
}

#[test]
fn orphan_guard_leaves_key_present_false_when_key_store_fails() {
    let (_dir, store) = temp_store();
    let work = SetKeyWork {
        provider: ProviderId::Custom,
        base_url: "https://example.test/v1".to_owned(),
        label: Some("Example".to_owned()),
        key: ApiKey::new("sk-never-stored".to_owned()),
    };
    let result = persist_connected_provider(&store, &work, &[model("gpt-4o-mini")], |_, _| {
        Err(crate::secrets::KeychainError::Backend)
    });
    assert!(result.is_err());
    let settings = store
        .provider_settings(ProviderId::Custom)
        .unwrap()
        .expect("settings row");
    assert!(!settings.key_present);
    assert_eq!(settings.base_url, "https://example.test/v1");
}

#[test]
fn connect_path_sanitizes_selected_and_persisted_model_id() {
    let (_dir, store) = temp_store();
    // A hostile catalog id carrying an ANSI sequence must be scrubbed before it
    // is persisted as the active model or returned to the TUI.
    let dirty = "gpt-4o\u{1b}[31m-mini";
    let work = SetKeyWork {
        provider: ProviderId::Custom,
        base_url: "https://example.test/v1".to_owned(),
        label: None,
        key: ApiKey::new("sk-ok".to_owned()),
    };
    let result = persist_connected_provider(&store, &work, &[model(dirty)], |_, _| Ok(())).unwrap();
    assert_eq!(result.selected_model.as_deref(), Some("gpt-4o-mini"));
    let selection = store.active_selection().unwrap().expect("active selection");
    assert_eq!(selection.model_id, "gpt-4o-mini");
}

#[test]
fn model_id_sanitization_strips_controls_and_ansi() {
    assert_eq!(
        sanitize_model_id("good\u{1b}[31m-red\u{1b}[0m\u{7f}\u{9f}\n-id"),
        "good-red-id"
    );
    assert_eq!(sanitize_model_id("a\u{1b}]0;owned\u{7}b"), "ab");
    assert_eq!(sanitize_model_id("a\u{1b}]0;owned\u{1b}\\b"), "ab");
}

#[test]
fn resolve_base_url_is_none_for_custom_without_store_settings() {
    let (_dir, store) = temp_store();

    let resolved = resolve_base_url(&store, ProviderId::Custom);

    assert_eq!(resolved, None);
}

#[test]
fn resolve_base_url_uses_compiled_endpoint_for_fixed_preset_providers() {
    let (_dir, store) = temp_store();
    store
        .upsert_provider_settings(&crate::store::ProviderSettings {
            provider: ProviderId::Custom,
            base_url: "https://attacker.example/v1".to_owned(),
            label: Some("Attacker".to_owned()),
            key_present: true,
            last_connected_at: None,
        })
        .unwrap();

    let resolved = resolve_base_url(&store, ProviderId::Kimi);

    assert_eq!(
        resolved.as_deref(),
        Some(crate::config::DEFAULT_KIMI_BASE_URL)
    );
}

#[test]
fn unreachable_set_key_does_not_leak_sentinel_to_persistent_sinks() {
    let dir = tempfile::tempdir().expect("temp dir");
    let logs_dir = dir.path().join("logs");
    std::fs::create_dir_all(&logs_dir).unwrap();
    let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).expect("store");
    let sentinel = format!("sk-u14-leak-{}", crate::debug_log::new_session_id());
    let work = SetKeyWork {
        provider: ProviderId::Custom,
        base_url: "https://127.0.0.1:1/v1".to_owned(),
        label: None,
        key: ApiKey::new(sentinel.clone()),
    };

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let result = runtime.block_on(set_provider_key(store.clone(), work));

    assert_eq!(result.outcome, SET_KEY_OUTCOME_UNREACHABLE);
    assert!(!serde_json::to_string(&result).unwrap().contains(&sentinel));
    for suffix in ["", "-wal", "-shm"] {
        let mut path = store.path().as_os_str().to_owned();
        path.push(suffix);
        let path = std::path::PathBuf::from(path);
        if path.exists() {
            let bytes = std::fs::read(path).unwrap();
            assert!(!String::from_utf8_lossy(&bytes).contains(&sentinel));
        }
    }
    for entry in std::fs::read_dir(logs_dir).unwrap() {
        let entry = entry.unwrap();
        if entry.file_type().unwrap().is_file() {
            let bytes = std::fs::read(entry.path()).unwrap();
            assert!(!String::from_utf8_lossy(&bytes).contains(&sentinel));
        }
    }
}
