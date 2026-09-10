use std::sync::Mutex;

use uuid::Uuid;

use super::{
    constants::DEFAULT_CONVERSATION_TITLE,
    error::ConversationServiceError,
    state::{lock_conversations, require_conversation},
    transcript::stored_message_with_id,
};
use crate::{
    conversation::store::{ConversationStore, PendingTurn, StoredMessageRole},
    llm::LlmService,
};

pub(crate) fn send_message(
    conversation_id: &str,
    content: String,
    conversation_store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
) -> Result<(), ConversationServiceError> {
    if content.trim().is_empty() {
        return Err(ConversationServiceError::EmptyMessage);
    }
    let turn_id = Uuid::new_v4().to_string();
    let mut store = lock_conversations(conversation_store)?;
    let conversation = require_conversation(&store, conversation_id)?;
    llm_service.validate_selection(conversation.provider, conversation.model.as_deref())?;
    let provisional_title = (conversation.messages.is_empty()
        && conversation.title == DEFAULT_CONVERSATION_TITLE)
        .then(|| super::title::provisional_title(&content));
    store.enqueue_message_turn(
        conversation_id,
        &PendingTurn {
            id: turn_id.clone(),
            content: content.clone(),
            retry_error_id: None,
            is_active: false,
        },
        &stored_message_with_id(turn_id, StoredMessageRole::User, content, None),
        provisional_title.as_deref(),
    )?;
    Ok(())
}

pub(crate) fn retry_message(
    conversation_id: &str,
    error_message_id: &str,
    conversation_store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
) -> Result<(), ConversationServiceError> {
    let turn_id = Uuid::new_v4().to_string();
    let mut store = lock_conversations(conversation_store)?;
    let conversation = require_conversation(&store, conversation_id)?;
    llm_service.validate_selection(conversation.provider, conversation.model.as_deref())?;
    let error_message = conversation
        .messages
        .iter()
        .find(|message| message.id == error_message_id)
        .ok_or_else(|| ConversationServiceError::MessageNotFound(error_message_id.to_owned()))?;
    if error_message.role != StoredMessageRole::Error {
        return Err(ConversationServiceError::InvalidRetry(
            error_message_id.to_owned(),
        ));
    }
    let user_content = store
        .load_retry_user_content(conversation_id, error_message_id)?
        .ok_or_else(|| ConversationServiceError::InvalidRetry(error_message_id.to_owned()))?;
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
            id: turn_id,
            content: user_content,
            retry_error_id: Some(error_message_id.to_owned()),
            is_active: false,
        },
    )?;
    Ok(())
}
