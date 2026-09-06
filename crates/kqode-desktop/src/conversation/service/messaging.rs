use std::sync::Mutex;

use super::{
    error::ConversationServiceError,
    state::{lock_conversations, require_conversation},
    turn_runner::{SendMessageResult, process_pending_turn},
};
use crate::{
    conversation::store::{ConversationStore, PendingTurn, StoredMessageRole},
    llm::LlmService,
};
use kqode_core::runtime::TurnQueue;

pub(crate) async fn send_message(
    conversation_id: &str,
    message_id: String,
    content: String,
    conversation_store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
    turn_queue: &TurnQueue,
    stream_handler: Option<super::ConversationMessageStreamHandler>,
) -> Result<SendMessageResult, ConversationServiceError> {
    if content.trim().is_empty() {
        return Err(ConversationServiceError::EmptyMessage);
    }
    {
        let mut store = lock_conversations(conversation_store)?;
        let conversation = require_conversation(&store, conversation_id)?;
        llm_service.validate_selection(conversation.provider, conversation.model.as_deref())?;
        store.enqueue_pending_turn(
            conversation_id,
            &PendingTurn {
                id: message_id.clone(),
                content,
                retry_error_id: None,
                is_active: false,
            },
        )?;
    }
    run_enqueued_turn(
        conversation_id,
        &message_id,
        conversation_store,
        llm_service,
        turn_queue,
        stream_handler,
    )
    .await
}

pub(crate) async fn retry_message(
    conversation_id: &str,
    error_message_id: &str,
    turn_id: String,
    conversation_store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
    turn_queue: &TurnQueue,
    stream_handler: Option<super::ConversationMessageStreamHandler>,
) -> Result<SendMessageResult, ConversationServiceError> {
    {
        let mut store = lock_conversations(conversation_store)?;
        let conversation = require_conversation(&store, conversation_id)?;
        llm_service.validate_selection(conversation.provider, conversation.model.as_deref())?;
        let error_index = conversation
            .messages
            .iter()
            .position(|message| message.id == error_message_id)
            .ok_or_else(|| {
                ConversationServiceError::MessageNotFound(error_message_id.to_owned())
            })?;
        if conversation.messages[error_index].role != StoredMessageRole::Error || error_index == 0 {
            return Err(ConversationServiceError::InvalidRetry(
                error_message_id.to_owned(),
            ));
        }
        let user_message = &conversation.messages[error_index - 1];
        if user_message.role != StoredMessageRole::User {
            return Err(ConversationServiceError::InvalidRetry(
                error_message_id.to_owned(),
            ));
        }
        if conversation
            .pending_turns
            .iter()
            .any(|turn| turn.retry_error_id.as_deref() == Some(error_message_id))
        {
            return Err(ConversationServiceError::DuplicateMessage(
                error_message_id.to_owned(),
            ));
        }
        store.enqueue_pending_turn(
            conversation_id,
            &PendingTurn {
                id: turn_id.clone(),
                content: user_message.content.clone(),
                retry_error_id: Some(error_message_id.to_owned()),
                is_active: false,
            },
        )?;
    }
    run_enqueued_turn(
        conversation_id,
        &turn_id,
        conversation_store,
        llm_service,
        turn_queue,
        stream_handler,
    )
    .await
}

async fn run_enqueued_turn(
    conversation_id: &str,
    turn_id: &str,
    conversation_store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
    turn_queue: &TurnQueue,
    stream_handler: Option<super::ConversationMessageStreamHandler>,
) -> Result<SendMessageResult, ConversationServiceError> {
    let queued = turn_queue.enqueue_request(conversation_id, turn_id)?;
    if turn_queue.active_request_id(conversation_id)?.as_deref() == Some(turn_id) {
        lock_conversations(conversation_store)?.prioritize_pending_turn(
            conversation_id,
            Some(turn_id),
            turn_id,
        )?;
    }
    process_pending_turn(
        conversation_id,
        turn_id,
        queued,
        conversation_store,
        llm_service,
        stream_handler,
    )
    .await
}
