use std::sync::{Mutex, MutexGuard};

use super::error::ConversationServiceError;
use crate::conversation::store::{Conversation, ConversationStore};

pub(super) fn require_conversation(
    store: &ConversationStore,
    conversation_id: &str,
) -> Result<Conversation, ConversationServiceError> {
    store
        .load_conversation(conversation_id)?
        .ok_or_else(|| ConversationServiceError::NotFound(conversation_id.to_owned()))
}

pub(super) fn lock_conversations(
    store: &Mutex<ConversationStore>,
) -> Result<MutexGuard<'_, ConversationStore>, ConversationServiceError> {
    store
        .lock()
        .map_err(|error| ConversationServiceError::Lock(error.to_string()))
}
