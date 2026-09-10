use std::sync::{Arc, Mutex};

use tokio::sync::oneshot;
use uuid::Uuid;

use crate::cancellation::ChatCancellationToken;

use super::{
    TurnQueueError,
    state::{QueueRegistry, TurnPermit, promote_next},
};

/// A queued request that can be awaited until it acquires the conversation.
pub struct QueuedTurn {
    pub(super) conversation_id: String,
    pub(super) entry_id: Uuid,
    pub(super) cancellation: ChatCancellationToken,
    pub(super) receiver: oneshot::Receiver<TurnPermit>,
    pub(super) state: Arc<Mutex<QueueRegistry>>,
}

/// Releases the active queue slot when the turn leaves scope.
pub struct TurnLease {
    conversation_id: String,
    entry_id: Uuid,
    cancellation: Option<ChatCancellationToken>,
    state: Arc<Mutex<QueueRegistry>>,
}

impl QueuedTurn {
    /// Waits until this turn acquires the queue or is removed.
    ///
    /// # Errors
    ///
    /// Returns an error when queue synchronization fails.
    pub async fn acquire(self) -> Result<Option<TurnLease>, TurnQueueError> {
        wait_for_turn(
            self.conversation_id,
            self.entry_id,
            Some(self.cancellation),
            self.receiver,
            self.state,
        )
        .await
    }

    /// Removes this turn from the queue without executing it.
    ///
    /// # Errors
    ///
    /// Returns an error when queue synchronization fails.
    pub fn abandon(self) -> Result<(), TurnQueueError> {
        let mut registry = super::state::lock_registry(&self.state)?;
        let Some(queue) = registry.conversations.get_mut(&self.conversation_id) else {
            return Ok(());
        };
        if queue
            .active
            .as_ref()
            .is_some_and(|active| active.entry_id == self.entry_id)
        {
            queue.active = None;
            promote_next(queue);
        } else if let Some(index) = queue
            .waiting
            .iter()
            .position(|entry| entry.entry_id == self.entry_id)
        {
            let entry = queue.waiting.remove(index).expect("queue index exists");
            let _ = entry.sender.send(TurnPermit::Removed);
        }
        if queue.active.is_none() && queue.waiting.is_empty() {
            registry.conversations.remove(&self.conversation_id);
        }
        Ok(())
    }
}

impl TurnLease {
    /// Returns the cancellation token associated with a request-backed turn.
    pub fn cancellation(&self) -> Option<ChatCancellationToken> {
        self.cancellation.clone()
    }
}

impl Drop for TurnLease {
    fn drop(&mut self) {
        let Ok(mut registry) = self.state.lock() else {
            return;
        };
        let Some(queue) = registry.conversations.get_mut(&self.conversation_id) else {
            return;
        };
        if queue
            .active
            .as_ref()
            .is_some_and(|active| active.entry_id == self.entry_id)
        {
            queue.active = None;
            promote_next(queue);
        }
        if queue.active.is_none() && queue.waiting.is_empty() {
            registry.conversations.remove(&self.conversation_id);
        }
    }
}

pub(super) async fn wait_for_turn(
    conversation_id: String,
    entry_id: Uuid,
    cancellation: Option<ChatCancellationToken>,
    receiver: oneshot::Receiver<TurnPermit>,
    state: Arc<Mutex<QueueRegistry>>,
) -> Result<Option<TurnLease>, TurnQueueError> {
    match receiver.await {
        Ok(TurnPermit::Acquired) => Ok(Some(TurnLease {
            conversation_id,
            entry_id,
            cancellation,
            state,
        })),
        Ok(TurnPermit::Removed) => Ok(None),
        Err(error) => Err(TurnQueueError::Wait(error.to_string())),
    }
}
