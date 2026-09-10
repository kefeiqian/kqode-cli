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
fn deleting_an_unstarted_turn_removes_its_user_message() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    let turn = pending("turn-1", "Queued");
    store
        .enqueue_message_turn(
            &conversation.id,
            &turn,
            &StoredMessage {
                id: turn.id.clone(),
                role: StoredMessageRole::User,
                content: turn.content.clone(),
                model: None,
            },
            None,
        )
        .unwrap();

    let deleted = store
        .delete_pending_turn(&conversation.id, &turn.id)
        .unwrap()
        .unwrap();

    assert!(deleted.pending_turns.is_empty());
    assert!(deleted.messages.is_empty());
}

#[test]
fn deleting_after_message_reordering_compacts_without_position_collisions() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    for (id, content) in [
        ("turn-1", "First"),
        ("turn-2", "Second"),
        ("turn-3", "Third"),
    ] {
        let turn = pending(id, content);
        store
            .enqueue_message_turn(
                &conversation.id,
                &turn,
                &StoredMessage {
                    id: id.to_owned(),
                    role: StoredMessageRole::User,
                    content: content.to_owned(),
                    model: None,
                },
                None,
            )
            .unwrap();
    }
    store
        .begin_pending_turn(&conversation.id, "turn-1", None, "assistant-1")
        .unwrap();

    let deleted = store
        .delete_pending_turn(&conversation.id, "turn-3")
        .unwrap()
        .unwrap();

    assert_eq!(
        deleted
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-2", "turn-1", "assistant-1"]
    );
}

#[test]
fn deleting_the_first_pending_turn_compacts_without_position_collisions() {
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

    let deleted = store
        .delete_pending_turn(&conversation.id, "turn-1")
        .unwrap()
        .unwrap();

    assert_eq!(
        deleted
            .pending_turns
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-2", "turn-3"]
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
fn polls_queued_turns_in_order_and_excludes_running_turns() {
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

    assert_eq!(
        store
            .load_queued_work()
            .unwrap()
            .into_iter()
            .map(|work| work.turn_id)
            .collect::<Vec<_>>(),
        vec!["turn-1", "turn-2", "turn-3"]
    );
    assert!(
        store
            .mark_pending_turn_running(&conversation.id, "turn-1")
            .unwrap()
    );
    assert!(
        !store
            .mark_pending_turn_running(&conversation.id, "turn-1")
            .unwrap()
    );
    assert_eq!(
        store
            .load_queued_work()
            .unwrap()
            .into_iter()
            .map(|work| work.turn_id)
            .collect::<Vec<_>>(),
        vec!["turn-2", "turn-3"]
    );
}

#[test]
fn claims_all_queued_work_in_one_durable_transition() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    for turn in [pending("turn-1", "First"), pending("turn-2", "Second")] {
        store.enqueue_pending_turn(&conversation.id, &turn).unwrap();
    }

    let claimed = store.claim_queued_work().unwrap();

    assert_eq!(
        claimed
            .iter()
            .map(|work| work.turn_id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-1", "turn-2"]
    );
    assert!(store.load_queued_work().unwrap().is_empty());
}

#[test]
fn failing_a_running_stream_persists_one_terminal_error() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    let turn = pending("turn-1", "Hello");
    store
        .enqueue_message_turn(
            &conversation.id,
            &turn,
            &StoredMessage {
                id: turn.id.clone(),
                role: StoredMessageRole::User,
                content: turn.content.clone(),
                model: None,
            },
            None,
        )
        .unwrap();
    assert!(
        store
            .mark_pending_turn_running(&conversation.id, &turn.id)
            .unwrap()
    );
    store
        .begin_pending_turn(&conversation.id, &turn.id, None, "assistant-1")
        .unwrap();

    assert!(
        store
            .fail_pending_turn(&conversation.id, &turn.id, "worker failed")
            .unwrap()
    );

    let failed = store.load_conversation(&conversation.id).unwrap().unwrap();
    assert!(failed.pending_turns.is_empty());
    assert_eq!(failed.messages.len(), 2);
    assert_eq!(failed.messages[1].id, "assistant-1");
    assert_eq!(failed.messages[1].role, StoredMessageRole::Error);
    assert_eq!(failed.messages[1].content, "worker failed");
    assert!(
        !store
            .fail_pending_turn(&conversation.id, &turn.id, "duplicate")
            .unwrap()
    );
}

#[test]
fn beginning_a_queued_turn_moves_its_user_message_to_the_transcript_tail() {
    let mut store = ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    let mut conversation = conversation();
    store.save_conversation(&mut conversation).unwrap();
    for turn in [
        pending("turn-1", "First"),
        pending("turn-2", "Second"),
        pending("turn-3", "Third"),
    ] {
        store
            .enqueue_message_turn(
                &conversation.id,
                &turn,
                &StoredMessage {
                    id: turn.id.clone(),
                    role: StoredMessageRole::User,
                    content: turn.content.clone(),
                    model: None,
                },
                None,
            )
            .unwrap();
    }
    store
        .begin_pending_turn(&conversation.id, "turn-1", None, "assistant-1")
        .unwrap();
    store
        .finish_pending_turn(
            &conversation.id,
            "turn-1",
            "assistant-1",
            StoredMessageRole::Assistant,
            "First response",
            None,
        )
        .unwrap();

    store
        .begin_pending_turn(&conversation.id, "turn-3", None, "assistant-3")
        .unwrap();

    let messages = store
        .load_conversation(&conversation.id)
        .unwrap()
        .unwrap()
        .messages;
    assert_eq!(
        messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-2", "turn-1", "assistant-1", "turn-3", "assistant-3"]
    );
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
