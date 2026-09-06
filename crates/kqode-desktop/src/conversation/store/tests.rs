use rusqlite::Connection;

use super::{Conversation, ConversationStore, StoredMessage, StoredMessageRole};
use crate::settings::Provider;

fn message(id: &str, role: StoredMessageRole, content: &str, model: Option<&str>) -> StoredMessage {
    StoredMessage {
        id: id.to_owned(),
        role,
        content: content.to_owned(),
        model: model.map(str::to_owned),
    }
}

#[test]
fn saves_and_loads_conversation_messages_in_order() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = Conversation {
        id: "conversation-1".to_owned(),
        title: "First conversation".to_owned(),
        updated_at: 0,
        workspace_path: Some(r"C:\code\kqode".to_owned()),
        provider: Some(Provider::Anthropic),
        model: Some("claude-test".to_owned()),
        messages: vec![
            message("message-1", StoredMessageRole::User, "Hello", None),
            message(
                "message-2",
                StoredMessageRole::Assistant,
                "Hi",
                Some("test-model"),
            ),
        ],
        pending_turns: vec![],
    };

    store.save_conversation(&mut conversation).unwrap();

    assert_eq!(
        store.load_conversation(&conversation.id).unwrap(),
        Some(conversation)
    );
}

#[test]
fn replacing_a_conversation_removes_stale_messages() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = Conversation {
        id: "conversation-1".to_owned(),
        title: "Original title".to_owned(),
        updated_at: 0,
        workspace_path: None,
        provider: Some(Provider::Kimi),
        model: Some("kimi-test".to_owned()),
        messages: vec![
            message("message-1", StoredMessageRole::User, "Hello", None),
            message("message-2", StoredMessageRole::Assistant, "Hi", None),
        ],
        pending_turns: vec![],
    };
    store.save_conversation(&mut conversation).unwrap();

    conversation.title = "Updated title".to_owned();
    conversation.messages.truncate(1);
    store.save_conversation(&mut conversation).unwrap();

    assert_eq!(
        store.load_conversation(&conversation.id).unwrap(),
        Some(conversation)
    );
}

#[test]
fn message_saves_preserve_a_concurrently_generated_title() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = Conversation {
        id: "conversation-1".to_owned(),
        title: "Provisional title".to_owned(),
        updated_at: 0,
        workspace_path: None,
        provider: Some(Provider::Kimi),
        model: Some("kimi-test".to_owned()),
        messages: vec![message("message-1", StoredMessageRole::User, "Hello", None)],
        pending_turns: vec![],
    };
    store.save_conversation(&mut conversation).unwrap();
    let mut stale_snapshot = conversation.clone();
    let initial_updated_at = conversation.updated_at;

    assert!(
        store
            .update_title_if_matches(&conversation.id, "Provisional title", "Generated title")
            .unwrap()
    );
    stale_snapshot.messages.push(message(
        "message-2",
        StoredMessageRole::Assistant,
        "Hi",
        Some("kimi-test"),
    ));
    store.save_messages(&mut stale_snapshot).unwrap();

    let saved = store.load_conversation(&conversation.id).unwrap().unwrap();
    assert_eq!(saved.title, "Generated title");
    assert_eq!(saved.messages, stale_snapshot.messages);
    assert!(saved.updated_at > initial_updated_at);
    assert_eq!(saved.updated_at, stale_snapshot.updated_at);
}

#[test]
fn generated_titles_require_the_expected_provisional_title() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = Conversation {
        id: "conversation-1".to_owned(),
        title: "User title".to_owned(),
        updated_at: 0,
        workspace_path: None,
        provider: Some(Provider::Kimi),
        model: Some("kimi-test".to_owned()),
        messages: vec![message("message-1", StoredMessageRole::User, "Hello", None)],
        pending_turns: vec![],
    };
    store.save_conversation(&mut conversation).unwrap();

    assert!(
        !store
            .update_title_if_matches(&conversation.id, "Provisional title", "Generated title")
            .unwrap()
    );
    assert_eq!(
        store
            .load_conversation(&conversation.id)
            .unwrap()
            .unwrap()
            .title,
        "User title"
    );
}

#[test]
fn adds_conversation_state_to_existing_schema() {
    let connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .unwrap();

    let mut store = ConversationStore::initialize(connection).unwrap();
    let mut conversation = Conversation {
        id: "conversation-1".to_owned(),
        title: "Migrated conversation".to_owned(),
        updated_at: 0,
        workspace_path: Some(r"C:\code\migrated".to_owned()),
        provider: Some(Provider::Openai),
        model: Some("gpt-test".to_owned()),
        messages: vec![],
        pending_turns: vec![],
    };
    store.save_conversation(&mut conversation).unwrap();

    assert_eq!(
        store.load_conversation(&conversation.id).unwrap(),
        Some(conversation)
    );
}

#[test]
fn archiving_a_conversation_hides_it_without_removing_messages() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = Conversation {
        id: "conversation-1".to_owned(),
        title: "Archive me".to_owned(),
        updated_at: 0,
        workspace_path: None,
        provider: None,
        model: None,
        messages: vec![message("message-1", StoredMessageRole::User, "Hello", None)],
        pending_turns: vec![],
    };
    store.save_conversation(&mut conversation).unwrap();

    store.archive_conversation(&conversation.id).unwrap();

    assert!(store.list_conversations().unwrap().is_empty());
    let message_count = store
        .connection
        .query_row("SELECT COUNT(*) FROM messages", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap();
    assert_eq!(message_count, 1);
    let archived = store
        .connection
        .query_row(
            "SELECT archived FROM conversations WHERE id = ?1",
            [&conversation.id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap();
    assert_eq!(archived, 1);
}
