use std::{env, path::PathBuf};

use rusqlite::Connection;

use crate::{
    database::{DATABASE_FILENAME, KQODE_DATA_DIRECTORY},
    inference::{ChatMessage, ChatMode, ChatRole},
    settings::{Provider, SettingsStore},
    tools::ToolRegistry,
};
use kqode_core::cancellation::ChatCancellationToken;
use kqode_provider::{ProviderConfig, chat, list_models};

#[tokio::test]
#[ignore = "requires ambient GitHub Copilot authentication and ~/.kqode/kqode.sqlite3"]
async fn completes_latest_conversation_first_prompt() {
    let database_path = home_directory()
        .join(KQODE_DATA_DIRECTORY)
        .join(DATABASE_FILENAME);
    assert!(
        database_path.is_file(),
        "Copilot SDK live test requires {}",
        database_path.display()
    );

    let store = SettingsStore::open(&database_path).unwrap();
    let mut settings = store.load_provider_settings(Provider::CopilotSdk).unwrap();
    if settings.model.trim().is_empty() {
        settings.model = store
            .load_provider_settings(Provider::Copilot)
            .unwrap()
            .model;
    }
    let mut model = settings.model.clone();
    let config = ProviderConfig::new(
        settings.provider,
        settings.api_base_url.clone(),
        settings.api_key.clone(),
        model.clone(),
    );
    let models = list_models(&config)
        .await
        .expect("Copilot SDK should list models with ambient authentication");
    if !models.iter().any(|candidate| candidate == &model) {
        model = models
            .first()
            .expect("Copilot SDK should report at least one model")
            .clone();
    }
    let config = ProviderConfig::new(
        settings.provider,
        settings.api_base_url,
        settings.api_key,
        model,
    );

    let messages = [ChatMessage {
        role: ChatRole::User,
        content: latest_conversation_first_prompt(&database_path),
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
    .expect("Copilot SDK should complete the stored conversation prompt");
    assert!(!completion.message.trim().is_empty());
    assert!(!completion.model.trim().is_empty());
}

fn latest_conversation_first_prompt(database_path: &std::path::Path) -> String {
    Connection::open(database_path)
        .unwrap()
        .query_row(
            "
            WITH latest_conversation AS (
                SELECT id FROM conversations
                WHERE archived = 0
                ORDER BY updated_at DESC, id ASC
                LIMIT 1
            )
            SELECT messages.content
            FROM latest_conversation
            JOIN messages ON messages.conversation_id = latest_conversation.id
            WHERE messages.role = 'user' AND trim(messages.content) <> ''
            ORDER BY messages.position ASC
            LIMIT 1
            ",
            [],
            |row| row.get(0),
        )
        .expect("database should contain a conversation with a user prompt")
}

fn home_directory() -> PathBuf {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .expect("home directory should be available")
}
