use std::sync::Mutex;

use super::{error::ConversationServiceError, state::lock_conversations};
use crate::conversation::store::{Conversation, ConversationStore};
use kqode_core::runtime::{DeleteResult, QueuedTurn, TurnQueue};

pub(crate) struct SteerTurnResult {
    pub(crate) conversation: Conversation,
    pub(crate) waiter: Option<QueuedTurn>,
}

pub(crate) fn steer_turn(
    conversation_id: &str,
    turn_id: &str,
    store: &Mutex<ConversationStore>,
    queue: &TurnQueue,
) -> Result<SteerTurnResult, ConversationServiceError> {
    let result = queue
        .steer_or_enqueue_request(conversation_id, turn_id)?
        .ok_or_else(|| ConversationServiceError::PendingTurnNotFound(turn_id.to_owned()))?;
    let conversation = lock_conversations(store)?
        .prioritize_pending_turn(
            conversation_id,
            result.active_request_id.as_deref(),
            turn_id,
        )?
        .ok_or_else(|| ConversationServiceError::PendingTurnNotFound(turn_id.to_owned()))?;
    Ok(SteerTurnResult {
        conversation,
        waiter: result.waiter,
    })
}

pub(crate) fn delete_turn(
    conversation_id: &str,
    turn_id: &str,
    store: &Mutex<ConversationStore>,
    queue: &TurnQueue,
) -> Result<Conversation, ConversationServiceError> {
    match queue.delete_request(conversation_id, turn_id)? {
        DeleteResult::Active => {
            return Err(ConversationServiceError::ActiveTurnCannotBeDeleted(
                turn_id.to_owned(),
            ));
        }
        DeleteResult::Deleted | DeleteResult::NotFound => {}
    }
    lock_conversations(store)?
        .delete_pending_turn(conversation_id, turn_id)?
        .ok_or_else(|| ConversationServiceError::PendingTurnNotFound(turn_id.to_owned()))
}
