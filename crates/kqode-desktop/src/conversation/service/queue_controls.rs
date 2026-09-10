use std::sync::Mutex;

use super::{error::ConversationServiceError, state::lock_conversations};
use crate::conversation::store::{Conversation, ConversationStore};
use kqode_core::runtime::{DeleteResult, TurnQueue};

pub(crate) struct SteerTurnResult {
    pub(crate) conversation: Conversation,
}

pub(crate) fn steer_turn(
    conversation_id: &str,
    turn_id: &str,
    store: &Mutex<ConversationStore>,
    queue: &TurnQueue,
) -> Result<SteerTurnResult, ConversationServiceError> {
    let active_request_id = queue.steer_request(conversation_id, turn_id)?;
    let conversation = lock_conversations(store)?
        .prioritize_pending_turn(conversation_id, active_request_id.as_deref(), turn_id)?
        .ok_or_else(|| ConversationServiceError::PendingTurnNotFound(turn_id.to_owned()))?;
    Ok(SteerTurnResult { conversation })
}

pub(crate) fn delete_turn(
    conversation_id: &str,
    turn_id: &str,
    store: &Mutex<ConversationStore>,
    queue: &TurnQueue,
) -> Result<Conversation, ConversationServiceError> {
    let mut deleted = None;
    match queue.delete_request_with(conversation_id, turn_id, || {
        deleted = lock_conversations(store)?.delete_pending_turn(conversation_id, turn_id)?;
        if deleted.is_none() {
            return Err(ConversationServiceError::PendingTurnNotFound(
                turn_id.to_owned(),
            ));
        }
        Ok(())
    })? {
        DeleteResult::Active => {
            return Err(ConversationServiceError::ActiveTurnCannotBeDeleted(
                turn_id.to_owned(),
            ));
        }
        DeleteResult::Deleted | DeleteResult::NotFound => {}
    }
    deleted.ok_or_else(|| ConversationServiceError::PendingTurnNotFound(turn_id.to_owned()))
}
