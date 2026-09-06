use uuid::Uuid;

use super::{constants::DEFAULT_CONVERSATION_TITLE, title::provisional_title};
use crate::{
    conversation::store::{Conversation, PendingTurn, StoredMessage, StoredMessageRole},
    inference::{ChatMessage, ChatRole},
};

pub(super) fn retry_user_message_id(
    conversation: &Conversation,
    pending: &PendingTurn,
) -> (Option<usize>, String) {
    let retry_error_index = pending.retry_error_id.as_deref().and_then(|error_id| {
        conversation
            .messages
            .iter()
            .position(|message| message.id == error_id)
    });
    let user_message_id = retry_error_index
        .and_then(|index| index.checked_sub(1))
        .and_then(|index| conversation.messages.get(index))
        .filter(|message| message.role == StoredMessageRole::User)
        .map(|message| message.id.clone())
        .unwrap_or_else(|| pending.id.clone());
    (retry_error_index, user_message_id)
}

pub(super) fn append_user_message(
    conversation: &mut Conversation,
    pending: &PendingTurn,
) -> Option<String> {
    if pending.retry_error_id.is_some()
        || conversation
            .messages
            .iter()
            .any(|message| message.id == pending.id)
    {
        return None;
    }
    let expected_title = (conversation.messages.is_empty()
        && conversation.title == DEFAULT_CONVERSATION_TITLE)
        .then(|| provisional_title(&pending.content));
    if let Some(title) = &expected_title {
        conversation.title.clone_from(title);
    }
    conversation.messages.push(StoredMessage {
        id: pending.id.clone(),
        role: StoredMessageRole::User,
        content: pending.content.clone(),
        model: None,
    });
    expected_title
}

pub(super) fn chat_messages(conversation: &Conversation) -> Vec<ChatMessage> {
    conversation
        .messages
        .iter()
        .filter_map(|message| {
            let role = match message.role {
                StoredMessageRole::User => ChatRole::User,
                StoredMessageRole::Assistant => ChatRole::Assistant,
                StoredMessageRole::Error => return None,
            };
            Some(ChatMessage {
                role,
                content: message.content.clone(),
            })
        })
        .collect()
}

pub(super) fn stored_message(
    role: StoredMessageRole,
    content: String,
    model: Option<String>,
) -> StoredMessage {
    stored_message_with_id(Uuid::new_v4().to_string(), role, content, model)
}

pub(super) fn stored_message_with_id(
    id: String,
    role: StoredMessageRole,
    content: String,
    model: Option<String>,
) -> StoredMessage {
    StoredMessage {
        id,
        role,
        content,
        model,
    }
}
