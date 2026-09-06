use super::validation::validate_selection;
use crate::inference::{ChatCompletion, ChatMessage, ChatMode, ChatRole};
use crate::settings::{LlmSettings, Provider};
use crate::tools::ToolRegistry;
use kqode_core::cancellation::ChatCancellationToken;
use kqode_provider::{
    ProviderConfig, chat,
    test_support::{parse_anthropic_completion, parse_completion, parse_models},
};

fn settings() -> LlmSettings {
    LlmSettings {
        provider: Provider::Kimi,
        api_base_url: LlmSettings::default().api_base_url,
        api_key: "test-key".to_owned(),
        api_key_preview: String::new(),
        highlighted_models: Vec::new(),
        model: "kimi-k3".to_owned(),
    }
}

#[test]
fn parses_chat_completion() {
    let completion =
        parse_completion(r#"{"model":"kimi-test","choices":[{"message":{"content":"Hello"}}]}"#)
            .expect("completion should parse");

    assert_eq!(
        completion,
        ChatCompletion {
            message: "Hello".to_owned(),
            model: "kimi-test".to_owned(),
        }
    );
}

#[tokio::test]
async fn rejects_incomplete_settings() {
    let mut settings = settings();
    settings.api_key.clear();
    assert!(
        chat(
            &ProviderConfig::new(
                settings.provider,
                settings.api_base_url.clone(),
                settings.api_key.clone(),
                settings.model.clone(),
            ),
            &[ChatMessage {
                role: ChatRole::User,
                content: "Hello".to_owned(),
            }],
            ChatMode::Complete,
            ChatCancellationToken::default(),
            None,
            None,
            &ToolRegistry::builtins(),
        )
        .await
        .is_err()
    );

    settings.api_key = "test-key".to_owned();
    settings.model.clear();
    assert!(
        chat(
            &ProviderConfig::new(
                settings.provider,
                settings.api_base_url.clone(),
                settings.api_key.clone(),
                settings.model.clone(),
            ),
            &[ChatMessage {
                role: ChatRole::User,
                content: "Hello".to_owned(),
            }],
            ChatMode::Complete,
            ChatCancellationToken::default(),
            None,
            None,
            &ToolRegistry::builtins(),
        )
        .await
        .is_err()
    );
}

#[test]
fn parses_remote_model_list() {
    let models = parse_models(
        r#"{"object":"list","data":[{"id":"kimi-k3"},{"id":"Alpha-model"},{"id":"future-kimi-model"}]}"#,
    )
    .expect("model list should parse");

    assert_eq!(models, vec!["Alpha-model", "future-kimi-model", "kimi-k3"]);
}

#[test]
fn parses_anthropic_completion() {
    let completion = parse_anthropic_completion(
        r#"{"model":"claude-test","content":[{"type":"text","text":"Hello"}]}"#,
    )
    .expect("Anthropic completion should parse");

    assert_eq!(
        completion,
        ChatCompletion {
            message: "Hello".to_owned(),
            model: "claude-test".to_owned(),
        }
    );
}

#[test]
fn rejects_missing_conversation_provider_and_model() {
    assert_eq!(
        validate_selection(None, None).unwrap_err().to_string(),
        "select a provider before sending a message"
    );
    assert_eq!(
        validate_selection(Some(Provider::Kimi), None)
            .unwrap_err()
            .to_string(),
        "select a model before sending a message"
    );
}

#[test]
fn rejects_missing_copilot_model() {
    assert_eq!(
        validate_selection(Some(Provider::Copilot), None)
            .unwrap_err()
            .to_string(),
        "select a model before sending a message"
    );
}

#[test]
fn rejects_missing_copilot_sdk_model() {
    assert_eq!(
        validate_selection(Some(Provider::CopilotSdk), None)
            .unwrap_err()
            .to_string(),
        "select a model before sending a message"
    );
}
