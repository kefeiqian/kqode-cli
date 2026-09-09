use rusqlite::Connection;

use super::{Conversation, ConversationStore, PendingTurn, StoredMessage, StoredMessageRole};

fn conversation() -> Conversation {
    Conversation {
        id: "conversation-1".to_owned(),
        title: "Queue test".to_owned(),
        updated_at: 0,
        workspace_path: None,
        provider: None,
        model: None,
        messages: vec![],
        pending_turns: vec![],
    }
}

fn pending(id: &str, content: &str) -> PendingTurn {
    PendingTurn {
        id: id.to_owned(),
        content: content.to_owned(),
        retry_error_id: None,
        is_active: false,
    }
}

#[test]
fn persists_pending_turns_with_the_conversation() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();

    let saved = store
        .enqueue_pending_turn(&conversation.id, &pending("turn-1", "First"))
        .unwrap();

    assert_eq!(saved.pending_turns, vec![pending("turn-1", "First")]);
    assert_eq!(
        store
            .load_conversation(&conversation.id)
            .unwrap()
            .unwrap()
            .pending_turns,
        vec![pending("turn-1", "First")]
    );
}

#[test]
fn reprioritizes_and_deletes_waiting_turns() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    for turn in [
        pending("turn-1", "First"),
        pending("turn-2", "Second"),
        pending("turn-3", "Third"),
    ] {
        store.enqueue_pending_turn(&conversation.id, &turn).unwrap();
    }

    let steered = store
        .prioritize_pending_turn(&conversation.id, Some("turn-1"), "turn-3")
        .unwrap()
        .unwrap();
    assert_eq!(
        steered
            .pending_turns
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-1", "turn-3", "turn-2"]
    );

    let deleted = store
        .delete_pending_turn(&conversation.id, "turn-2")
        .unwrap()
        .unwrap();
    assert_eq!(
        deleted
            .pending_turns
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-1", "turn-3"]
    );
}

#[test]
fn completes_messages_and_pending_turn_atomically() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    store
        .enqueue_pending_turn(&conversation.id, &pending("turn-1", "Hello"))
        .unwrap();
    conversation.messages.push(StoredMessage {
        id: "turn-1".to_owned(),
        role: StoredMessageRole::User,
        content: "Hello".to_owned(),
        model: None,
    });

    store
        .save_messages_and_remove_pending_turn(&mut conversation, "turn-1")
        .unwrap();

    assert!(conversation.pending_turns.is_empty());
    assert_eq!(conversation.messages.len(), 1);
    assert_eq!(conversation.messages[0].id, "turn-1");
}

#[test]
fn recovers_an_unstarted_pending_turn_as_a_retryable_error() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    store
        .enqueue_pending_turn(&conversation.id, &pending("turn-1", "Hello"))
        .unwrap();

    assert_eq!(store.recover_interrupted_turns().unwrap(), 1);

    let recovered = store.load_conversation(&conversation.id).unwrap().unwrap();
    assert!(recovered.pending_turns.is_empty());
    assert_eq!(recovered.messages.len(), 2);
    assert_eq!(recovered.messages[0].id, "turn-1");
    assert_eq!(recovered.messages[0].role, StoredMessageRole::User);
    assert_eq!(recovered.messages[0].content, "Hello");
    assert_eq!(recovered.messages[1].role, StoredMessageRole::Error);
}

#[test]
fn replaces_a_partial_interrupted_response_with_a_retryable_error() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    conversation.messages = vec![
        StoredMessage {
            id: "turn-1".to_owned(),
            role: StoredMessageRole::User,
            content: "Hello".to_owned(),
            model: None,
        },
        StoredMessage {
            id: "assistant-1".to_owned(),
            role: StoredMessageRole::Assistant,
            content: "Partial response".to_owned(),
            model: Some("test-model".to_owned()),
        },
    ];
    store.save_conversation(&mut conversation).unwrap();
    store
        .enqueue_pending_turn(&conversation.id, &pending("turn-1", "Hello"))
        .unwrap();

    assert_eq!(store.recover_interrupted_turns().unwrap(), 1);

    let recovered = store.load_conversation(&conversation.id).unwrap().unwrap();
    assert!(recovered.pending_turns.is_empty());
    assert_eq!(recovered.messages.len(), 2);
    assert_eq!(recovered.messages[0].role, StoredMessageRole::User);
    assert_eq!(recovered.messages[1].role, StoredMessageRole::Error);
}

#[test]
fn preserves_the_original_error_when_an_unstarted_retry_is_interrupted() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    conversation.messages = vec![
        StoredMessage {
            id: "user-1".to_owned(),
            role: StoredMessageRole::User,
            content: "Hello".to_owned(),
            model: None,
        },
        StoredMessage {
            id: "error-1".to_owned(),
            role: StoredMessageRole::Error,
            content: "Original error".to_owned(),
            model: None,
        },
    ];
    store.save_conversation(&mut conversation).unwrap();
    store
        .enqueue_pending_turn(
            &conversation.id,
            &PendingTurn {
                id: "retry-1".to_owned(),
                content: "Hello".to_owned(),
                retry_error_id: Some("error-1".to_owned()),
                is_active: false,
            },
        )
        .unwrap();

    assert_eq!(store.recover_interrupted_turns().unwrap(), 1);

    let recovered = store.load_conversation(&conversation.id).unwrap().unwrap();
    assert!(recovered.pending_turns.is_empty());
    assert_eq!(recovered.messages, conversation.messages);
}

#[test]
fn recovers_an_interrupted_active_retry_without_duplicating_the_user_message() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    conversation.messages = vec![StoredMessage {
        id: "user-1".to_owned(),
        role: StoredMessageRole::User,
        content: "Hello".to_owned(),
        model: None,
    }];
    store.save_conversation(&mut conversation).unwrap();
    store
        .enqueue_pending_turn(
            &conversation.id,
            &PendingTurn {
                id: "retry-1".to_owned(),
                content: "Hello".to_owned(),
                retry_error_id: Some("removed-error".to_owned()),
                is_active: false,
            },
        )
        .unwrap();

    assert_eq!(store.recover_interrupted_turns().unwrap(), 1);

    let recovered = store.load_conversation(&conversation.id).unwrap().unwrap();
    assert!(recovered.pending_turns.is_empty());
    assert_eq!(recovered.messages.len(), 2);
    assert_eq!(recovered.messages[0].id, "user-1");
    assert_eq!(recovered.messages[0].role, StoredMessageRole::User);
    assert_eq!(recovered.messages[1].role, StoredMessageRole::Error);
}
