use kqode_core::{
    cancellation::ChatCancellationToken,
    model::{ChatMessage, ChatMode, ChatRole},
    tool::ToolRegistry,
};
use kqode_provider::{Provider, ProviderConfig, chat, list_models};

#[tokio::test]
#[ignore = "requires ambient GitHub Copilot authentication and network access"]
async fn lists_models_and_completes_a_fixed_prompt() {
    let discovery_config = ProviderConfig::new(
        Provider::CopilotSdk,
        String::new(),
        String::new(),
        String::new(),
    );
    let models = list_models(&discovery_config)
        .await
        .expect("Copilot SDK should list models with ambient authentication");
    let model = models
        .first()
        .expect("Copilot SDK should report at least one model")
        .clone();
    let config = ProviderConfig::new(Provider::CopilotSdk, String::new(), String::new(), model);
    let messages = [ChatMessage {
        role: ChatRole::User,
        content: "This is a provider smoke test. Reply with OK.".to_owned(),
    }];

    let completion = chat(
        &config,
        &messages,
        ChatMode::Complete,
        ChatCancellationToken::default(),
        None,
        None,
        &ToolRegistry::new(),
    )
    .await
    .expect("Copilot SDK should complete the fixed smoke-test prompt");

    assert!(!completion.message.trim().is_empty());
    assert!(!completion.model.trim().is_empty());
}
