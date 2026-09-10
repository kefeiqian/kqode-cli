use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use super::{
    ConversationService, archive_conversation, create_conversation, delete_turn,
    error::ConversationServiceError, list_conversations, send_message, steer_turn,
    update_conversation,
};
use crate::{
    conversation::store::{ConversationStore, PendingTurn, StoredMessage, StoredMessageRole},
    llm::LlmService,
    settings::{LlmSettings, Provider, SettingsStore},
};
use kqode_core::runtime::TurnQueue;

fn store() -> Mutex<ConversationStore> {
    Mutex::new(ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap())
}

fn llm_service() -> LlmService {
    LlmService::new(Arc::new(Mutex::new(
        SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap(),
    )))
}

fn llm_service_with_invalid_endpoint() -> LlmService {
    let store = SettingsStore::initialize(Connection::open_in_memory().unwrap()).unwrap();
    store
        .save_settings(&LlmSettings {
            provider: Provider::Kimi,
            api_base_url: "invalid-url".to_owned(),
            api_key: "test-key".to_owned(),
            api_key_preview: String::new(),
            highlighted_models: Vec::new(),
            model: "kimi-test".to_owned(),
        })
        .unwrap();
    LlmService::new(Arc::new(Mutex::new(store)))
}

#[test]
fn creates_and_persists_an_unconfigured_conversation() {
    let conversation_store = store();

    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();

    assert_eq!(conversation.title, "New conversation");
    assert_eq!(conversation.workspace_path, None);
    assert_eq!(conversation.provider, None);
    assert_eq!(conversation.model, None);
    assert_eq!(
        conversation_store
            .lock()
            .unwrap()
            .load_conversation(&conversation.id)
            .unwrap(),
        Some(conversation)
    );
}

#[tokio::test]
async fn updates_title_without_changing_workspace() {
    let conversation_store = store();
    let turn_queue = TurnQueue::default();
    let conversation = create_conversation(
        Some(r"C:\workspace".to_owned()),
        Some(Provider::Kimi),
        Some("kimi-k3".to_owned()),
        &conversation_store,
    )
    .unwrap();
    let mut started_conversation = conversation.clone();
    started_conversation.messages.push(StoredMessage {
        id: "message-1".to_owned(),
        role: StoredMessageRole::User,
        content: "Hello".to_owned(),
        model: None,
    });
    conversation_store
        .lock()
        .unwrap()
        .save_conversation(&mut started_conversation)
        .unwrap();

    let updated = update_conversation(
        &conversation.id,
        Some(" Renamed conversation ".to_owned()),
        Some(Provider::Kimi),
        Some("kimi-k3".to_owned()),
        &conversation_store,
        &turn_queue,
    )
    .await
    .unwrap();

    assert_eq!(updated.title, "Renamed conversation");
    assert_eq!(updated.workspace_path.as_deref(), Some(r"C:\workspace"));
}

#[tokio::test]
async fn rejects_an_empty_conversation_title() {
    let conversation_store = store();
    let turn_queue = TurnQueue::default();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();

    let error = update_conversation(
        &conversation.id,
        Some("   ".to_owned()),
        Some(Provider::Kimi),
        Some("kimi-k3".to_owned()),
        &conversation_store,
        &turn_queue,
    )
    .await
    .unwrap_err();

    assert!(matches!(error, ConversationServiceError::EmptyTitle));
}

#[tokio::test]
async fn rejects_renaming_an_empty_conversation() {
    let conversation_store = store();
    let turn_queue = TurnQueue::default();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();

    let error = update_conversation(
        &conversation.id,
        Some("Renamed conversation".to_owned()),
        Some(Provider::Kimi),
        Some("kimi-k3".to_owned()),
        &conversation_store,
        &turn_queue,
    )
    .await
    .unwrap_err();

    assert!(matches!(
        error,
        ConversationServiceError::EmptyConversationRename
    ));
}

#[test]
fn reuses_an_existing_empty_conversation() {
    let conversation_store = store();
    let first = create_conversation(None, None, None, &conversation_store).unwrap();

    let second = create_conversation(None, None, None, &conversation_store).unwrap();

    assert_eq!(second.id, first.id);
    assert_eq!(list_conversations(&conversation_store).unwrap().len(), 1);
}

#[test]
fn creates_a_conversation_with_the_selected_workspace() {
    let conversation_store = store();

    let conversation = create_conversation(
        Some(r"C:\workspace".to_owned()),
        Some(Provider::Kimi),
        Some("kimi-k3".to_owned()),
        &conversation_store,
    )
    .unwrap();

    assert_eq!(
        conversation.workspace_path.as_deref(),
        Some(r"C:\workspace")
    );
}

#[test]
fn applies_a_selected_workspace_to_an_existing_empty_conversation() {
    let conversation_store = store();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();

    let reused = create_conversation(
        Some(r"C:\workspace".to_owned()),
        Some(Provider::Openai),
        Some("gpt-test".to_owned()),
        &conversation_store,
    )
    .unwrap();

    assert_eq!(reused.id, conversation.id);
    assert_eq!(reused.workspace_path.as_deref(), Some(r"C:\workspace"));
    assert_eq!(reused.provider, Some(Provider::Openai));
    assert_eq!(reused.model.as_deref(), Some("gpt-test"));
}

#[tokio::test]
async fn archives_a_conversation_without_loading_a_replacement() {
    let conversation_store = store();
    let turn_queue = TurnQueue::default();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();

    archive_conversation(&conversation.id, &conversation_store, &turn_queue)
        .await
        .unwrap();

    assert!(
        conversation_store
            .lock()
            .unwrap()
            .load_conversation(&conversation.id)
            .unwrap()
            .is_none()
    );
}

#[test]
fn rejects_messages_before_a_provider_is_selected() {
    let conversation_store = store();
    let llm_service = llm_service();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();

    let error = send_message(
        &conversation.id,
        "Hello".to_owned(),
        &conversation_store,
        &llm_service,
    )
    .expect_err("message should be rejected");

    assert!(matches!(error, ConversationServiceError::Llm(_)));
    assert!(
        conversation_store
            .lock()
            .unwrap()
            .load_conversation(&conversation.id)
            .unwrap()
            .unwrap()
            .messages
            .is_empty()
    );
}

#[test]
fn rejects_copilot_messages_before_a_model_is_selected() {
    let conversation_store = store();
    let llm_service = llm_service();
    let conversation =
        create_conversation(None, Some(Provider::Copilot), None, &conversation_store).unwrap();

    let error = send_message(
        &conversation.id,
        "Hello".to_owned(),
        &conversation_store,
        &llm_service,
    )
    .expect_err("message should be rejected");

    assert!(matches!(error, ConversationServiceError::Llm(_)));
    assert!(
        conversation_store
            .lock()
            .unwrap()
            .load_conversation(&conversation.id)
            .unwrap()
            .unwrap()
            .messages
            .is_empty()
    );
}

#[test]
fn persists_the_provisional_title_before_the_llm_request_finishes() {
    let conversation_store = store();
    let llm_service = llm_service_with_invalid_endpoint();
    let conversation = create_conversation(
        None,
        Some(Provider::Kimi),
        Some("kimi-test".to_owned()),
        &conversation_store,
    )
    .unwrap();

    send_message(
        &conversation.id,
        "Explain this update function".to_owned(),
        &conversation_store,
        &llm_service,
    )
    .unwrap();

    assert_eq!(
        conversation_store
            .lock()
            .unwrap()
            .load_conversation(&conversation.id)
            .unwrap()
            .unwrap()
            .title,
        "Explain this update function"
    );
}

#[tokio::test]
async fn background_turn_processing_persists_a_terminal_error() {
    let conversation_store = Arc::new(store());
    let llm_service = llm_service_with_invalid_endpoint();
    let turn_queue = TurnQueue::default();
    let service =
        ConversationService::new(Arc::clone(&conversation_store), llm_service, turn_queue);
    let conversation = service
        .create(None, Some(Provider::Kimi), Some("kimi-test".to_owned()))
        .unwrap();
    service.send(&conversation.id, "Hello".to_owned()).unwrap();
    let work = service.claim_pending_work().unwrap().pop().unwrap();

    service
        .run_queued(&work.conversation_id, &work.turn_id, work.queued, None)
        .await
        .unwrap();

    let saved = conversation_store
        .lock()
        .unwrap()
        .load_conversation(&conversation.id)
        .unwrap()
        .unwrap();
    assert!(saved.pending_turns.is_empty());
    assert_eq!(saved.messages.len(), 2);
    assert_eq!(saved.messages[0].role, StoredMessageRole::User);
    assert_eq!(saved.messages[1].role, StoredMessageRole::Error);
}

#[test]
fn service_claims_backend_generated_turns_from_persistent_storage() {
    let conversation_store = Arc::new(store());
    let llm_service = llm_service_with_invalid_endpoint();
    let turn_queue = TurnQueue::default();
    let service =
        ConversationService::new(Arc::clone(&conversation_store), llm_service, turn_queue);
    let conversation = service
        .create(None, Some(Provider::Kimi), Some("kimi-test".to_owned()))
        .unwrap();

    service.send(&conversation.id, "First".to_owned()).unwrap();
    service.send(&conversation.id, "Second".to_owned()).unwrap();

    let mut claimed = service.claim_pending_work().unwrap();
    assert_eq!(claimed.len(), 1);
    let first = claimed.remove(0);
    assert!(!first.turn_id.is_empty());
    assert!(service.claim_pending_work().unwrap().is_empty());
    first.queued.abandon().unwrap();
    let saved = conversation_store
        .lock()
        .unwrap()
        .load_conversation(&conversation.id)
        .unwrap()
        .unwrap();
    assert_eq!(saved.pending_turns.len(), 2);
    assert_eq!(saved.messages.len(), 2);
    assert_eq!(saved.pending_turns[0].id, first.turn_id);
    assert_ne!(saved.pending_turns[0].id, saved.pending_turns[1].id);
}

#[tokio::test]
async fn steer_cancels_the_active_turn_and_reorders_persisted_turns() {
    let conversation_store = store();
    let queue = TurnQueue::default();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();
    {
        let mut store = conversation_store.lock().unwrap();
        for (id, content) in [
            ("turn-1", "First"),
            ("turn-2", "Second"),
            ("turn-3", "Third"),
        ] {
            store
                .enqueue_pending_turn(
                    &conversation.id,
                    &PendingTurn {
                        id: id.to_owned(),
                        content: content.to_owned(),
                        retry_error_id: None,
                        is_active: false,
                    },
                )
                .unwrap();
        }
    }
    let active = queue
        .enqueue_request(&conversation.id, "turn-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();
    let _second = queue.enqueue_request(&conversation.id, "turn-2").unwrap();
    let third = queue.enqueue_request(&conversation.id, "turn-3").unwrap();

    let steered = steer_turn(&conversation.id, "turn-3", &conversation_store, &queue).unwrap();

    assert!(active.cancellation().unwrap().is_cancelled());
    assert_eq!(
        steered
            .conversation
            .pending_turns
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-1", "turn-3", "turn-2"]
    );
    drop(active);
    assert!(third.acquire().await.unwrap().is_some());
}

#[tokio::test]
async fn steering_an_unclaimed_turn_makes_it_the_next_durable_claim() {
    let conversation_store = Arc::new(store());
    let queue = TurnQueue::default();
    let service = ConversationService::new(
        Arc::clone(&conversation_store),
        llm_service(),
        queue.clone(),
    );
    let conversation = service.create(None, None, None).unwrap();
    {
        let mut store = conversation_store.lock().unwrap();
        for (id, content) in [
            ("turn-1", "First"),
            ("turn-2", "Second"),
            ("turn-3", "Third"),
        ] {
            store
                .enqueue_pending_turn(
                    &conversation.id,
                    &PendingTurn {
                        id: id.to_owned(),
                        content: content.to_owned(),
                        retry_error_id: None,
                        is_active: false,
                    },
                )
                .unwrap();
        }
        assert!(
            store
                .mark_pending_turn_running(&conversation.id, "turn-1")
                .unwrap()
        );
    }
    let active = queue
        .enqueue_request(&conversation.id, "turn-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();

    service.steer(&conversation.id, "turn-3").unwrap();

    assert!(active.cancellation().unwrap().is_cancelled());
    drop(active);
    conversation_store
        .lock()
        .unwrap()
        .delete_pending_turn(&conversation.id, "turn-1")
        .unwrap();
    let claimed = service.claim_pending_work().unwrap();
    assert_eq!(claimed.len(), 1);
    assert_eq!(claimed[0].turn_id, "turn-3");
}

#[tokio::test]
async fn steer_view_marks_the_target_turn_active_immediately() {
    let conversation_store = Arc::new(store());
    let queue = TurnQueue::default();
    let service = ConversationService::new(
        Arc::clone(&conversation_store),
        llm_service(),
        queue.clone(),
    );
    let conversation = service.create(None, None, None).unwrap();
    {
        let mut store = conversation_store.lock().unwrap();
        for (id, content) in [("turn-1", "First"), ("turn-2", "Second")] {
            store
                .enqueue_pending_turn(
                    &conversation.id,
                    &PendingTurn {
                        id: id.to_owned(),
                        content: content.to_owned(),
                        retry_error_id: None,
                        is_active: false,
                    },
                )
                .unwrap();
        }
    }
    let active = queue
        .enqueue_request(&conversation.id, "turn-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();
    let _second = queue.enqueue_request(&conversation.id, "turn-2").unwrap();

    let view = service.steer(&conversation.id, "turn-2").unwrap();

    assert!(active.cancellation().unwrap().is_cancelled());
    assert_eq!(
        view.pending_turns
            .iter()
            .filter(|turn| turn.is_active)
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn-2"]
    );
}

#[tokio::test]
async fn deletes_a_waiting_turn_from_memory_and_storage() {
    let conversation_store = store();
    let queue = TurnQueue::default();
    let conversation = create_conversation(None, None, None, &conversation_store).unwrap();
    {
        let mut store = conversation_store.lock().unwrap();
        for (id, content) in [("turn-1", "First"), ("turn-2", "Second")] {
            store
                .enqueue_pending_turn(
                    &conversation.id,
                    &PendingTurn {
                        id: id.to_owned(),
                        content: content.to_owned(),
                        retry_error_id: None,
                        is_active: false,
                    },
                )
                .unwrap();
        }
    }
    let active = queue
        .enqueue_request(&conversation.id, "turn-1")
        .unwrap()
        .acquire()
        .await
        .unwrap()
        .unwrap();
    let deleted_waiter = queue.enqueue_request(&conversation.id, "turn-2").unwrap();

    let updated = delete_turn(&conversation.id, "turn-2", &conversation_store, &queue).unwrap();

    assert_eq!(updated.pending_turns.len(), 1);
    assert_eq!(updated.pending_turns[0].id, "turn-1");
    assert!(deleted_waiter.acquire().await.unwrap().is_none());
    drop(active);
}
