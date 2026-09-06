use std::{env, path::PathBuf};

use super::{ToolCall, ToolRegistry};
use crate::{
    database::{DATABASE_FILENAME, KQODE_DATA_DIRECTORY},
    settings::{Provider, SettingsStore},
};
use kqode_provider::{
    ProviderConfig,
    test_support::{CopilotSdkToolSelectionClient, KimiToolSelectionClient},
};

const CASES: [(&str, &str); 3] = [
    (
        "run_command",
        "Call run_command with command set to `Get-Location`. Return the tool call now and do not \
         answer with prose.",
    ),
    (
        "fetch_web_url",
        "Call fetch_web_url with url set to `https://example.com`. Return the tool call now and do \
         not answer with prose.",
    ),
    (
        "ask_user",
        "Call ask_user with one question whose id is `environment` and whose question \
         text is exactly `Use staging or production?`. Return the tool call now and do not answer \
         with prose.",
    ),
];

#[tokio::test]
#[ignore = "requires configured ~/.kqode/kqode.sqlite3 credentials and network access"]
async fn kimi_selects_each_registered_tool_from_its_description() {
    let store = settings_store("Kimi");
    let settings = store.load_provider_settings(Provider::Kimi).unwrap();
    assert!(!settings.api_key.trim().is_empty());
    assert!(!settings.model.trim().is_empty());
    assert_eq!(
        settings.api_base_url.trim().trim_end_matches('/'),
        Provider::Kimi.default_api_base_url()
    );

    let registry = ToolRegistry::builtins();
    let tools = registry.definitions();
    let client = KimiToolSelectionClient::new(ProviderConfig::new(
        settings.provider,
        settings.api_base_url,
        settings.api_key,
        settings.model,
    ))
    .unwrap();
    for (expected_tool, prompt) in CASES {
        let call = client.select_tool(&tools, prompt).await.unwrap();
        assert_tool_call(expected_tool, &call);
    }
}

#[tokio::test]
#[ignore = "requires ambient GitHub Copilot authentication and ~/.kqode/kqode.sqlite3"]
async fn copilot_sdk_selects_each_registered_tool_from_its_description() {
    let store = settings_store("Copilot SDK");
    let mut settings = store.load_provider_settings(Provider::CopilotSdk).unwrap();
    if settings.model.trim().is_empty() {
        settings.model = store
            .load_provider_settings(Provider::Copilot)
            .unwrap()
            .model;
    }

    let registry = ToolRegistry::builtins();
    let tools = registry.definitions();
    let client = CopilotSdkToolSelectionClient::start(&settings.model)
        .await
        .unwrap();
    for (expected_tool, prompt) in CASES {
        let call = client.select_tool(&tools, prompt).await.unwrap();
        assert_tool_call(expected_tool, &call);
    }
    client.stop().await.unwrap();
}

fn assert_tool_call(expected_tool: &str, call: &ToolCall) {
    assert_eq!(call.canonical_name, expected_tool);
    match expected_tool {
        "run_command" => assert_eq!(call.arguments["command"], "Get-Location"),
        "fetch_web_url" => assert_eq!(call.arguments["url"], "https://example.com"),
        "ask_user" => {
            let question = call.arguments["questions"]
                .as_array()
                .and_then(|questions| questions.first())
                .expect("ask_user should contain one question");
            assert_eq!(question["id"], "environment");
            assert_eq!(question["question"], "Use staging or production?");
        }
        _ => panic!("unexpected tool {expected_tool}"),
    }
}

fn settings_store(provider_name: &str) -> SettingsStore {
    let database_path = home_directory()
        .join(KQODE_DATA_DIRECTORY)
        .join(DATABASE_FILENAME);
    assert!(
        database_path.is_file(),
        "{provider_name} live test requires {}",
        database_path.display()
    );
    SettingsStore::open(&database_path).unwrap()
}

fn home_directory() -> PathBuf {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .expect("home directory should be available")
}
