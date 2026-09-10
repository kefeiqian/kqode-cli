use std::sync::{Arc, Mutex};

use tokio::sync::oneshot;
use uuid::Uuid;

use crate::cancellation::ChatCancellationToken;

use super::{
    TurnQueueError,
    lease::{QueuedTurn, TurnLease, wait_for_turn},
    state::{
        QueueRegistry, TurnPermit, WaitingEntry, contains_request, lock_registry, promote_next,
    },
};

#[derive(Clone, Default)]
/// Serializes turns sharing a key while allowing unrelated keys to run concurrently.
pub struct TurnQueue {
    state: Arc<Mutex<QueueRegistry>>,
}

/// Outcome of trying to remove one request from a queue.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeleteResult {
    Deleted,
    Active,
    NotFound,
}

impl TurnQueue {
    /// Waits for exclusive access to the supplied queue key.
    ///
    /// # Errors
    ///
    /// Returns an error when queue synchronization fails.
    pub async fn acquire(&self, conversation_id: &str) -> Result<TurnLease, TurnQueueError> {
        let (entry_id, receiver) = self.register(conversation_id, None, None)?;
        wait_for_turn(
            conversation_id.to_owned(),
            entry_id,
            None,
            receiver,
            Arc::clone(&self.state),
        )
        .await?
        .ok_or_else(|| TurnQueueError::EntryRemoved(entry_id.to_string()))
    }

    /// Registers a cancellable request under the supplied queue key.
    ///
    /// # Errors
    ///
    /// Returns an error when the request identifier is already active or waiting.
    pub fn enqueue_request(
        &self,
        conversation_id: &str,
        request_id: &str,
    ) -> Result<QueuedTurn, TurnQueueError> {
        let cancellation = ChatCancellationToken::default();
        let (entry_id, receiver) = self.register(
            conversation_id,
            Some(request_id.to_owned()),
            Some(cancellation.clone()),
        )?;
        Ok(QueuedTurn {
            conversation_id: conversation_id.to_owned(),
            entry_id,
            cancellation,
            receiver,
            state: Arc::clone(&self.state),
            registered: true,
        })
    }

    /// Prioritizes an existing request and cancels the active request.
    ///
    /// Requests not yet claimed by a worker remain absent from the in-memory
    /// queue and can be claimed from durable storage later.
    ///
    /// # Errors
    ///
    /// Returns an error when queue synchronization fails.
    pub fn steer_request(
        &self,
        conversation_id: &str,
        request_id: &str,
    ) -> Result<Option<String>, TurnQueueError> {
        self.steer_request_with(conversation_id, request_id, |_| Ok(()))
    }

    /// Performs a durable reorder before mutating or cancelling the live queue.
    ///
    /// # Errors
    ///
    /// Returns the caller error without changing queue state when the durable
    /// reorder fails.
    pub fn steer_request_with<E>(
        &self,
        conversation_id: &str,
        request_id: &str,
        reorder: impl FnOnce(Option<&str>) -> Result<(), E>,
    ) -> Result<Option<String>, E>
    where
        E: From<TurnQueueError>,
    {
        let mut registry = lock_registry(&self.state)?;
        let Some(queue) = registry.conversations.get_mut(conversation_id) else {
            reorder(None)?;
            return Ok(None);
        };
        if queue
            .active
            .as_ref()
            .is_some_and(|entry| entry.request_id.as_deref() == Some(request_id))
        {
            reorder(Some(request_id))?;
            return Ok(Some(request_id.to_owned()));
        }
        let active_request_id = queue
            .active
            .as_ref()
            .and_then(|active| active.request_id.clone());
        reorder(active_request_id.as_deref())?;
        if let Some(index) = queue
            .waiting
            .iter()
            .position(|entry| entry.request_id.as_deref() == Some(request_id))
        {
            let target = queue.waiting.remove(index).expect("queue index exists");
            queue.waiting.push_front(target);
        }
        if let Some(cancellation) = queue
            .active
            .as_ref()
            .and_then(|active| active.cancellation.as_ref())
        {
            cancellation.cancel();
        }
        promote_next(queue);
        Ok(active_request_id)
    }

    /// Returns the active request identifier for the supplied queue key.
    ///
    /// # Errors
    ///
    /// Returns an error when queue synchronization fails.
    pub fn active_request_id(
        &self,
        conversation_id: &str,
    ) -> Result<Option<String>, TurnQueueError> {
        Ok(lock_registry(&self.state)?
            .conversations
            .get(conversation_id)
            .and_then(|queue| queue.active.as_ref())
            .and_then(|active| active.request_id.clone()))
    }

    /// Deletes a waiting request without interrupting an active request.
    ///
    /// # Errors
    ///
    /// Returns an error when queue synchronization fails.
    pub fn delete_request(
        &self,
        conversation_id: &str,
        request_id: &str,
    ) -> Result<DeleteResult, TurnQueueError> {
        let mut registry = lock_registry(&self.state)?;
        let Some(queue) = registry.conversations.get_mut(conversation_id) else {
            return Ok(DeleteResult::NotFound);
        };
        if queue
            .active
            .as_ref()
            .is_some_and(|entry| entry.request_id.as_deref() == Some(request_id))
        {
            return Ok(DeleteResult::Active);
        }
        let Some(index) = queue
            .waiting
            .iter()
            .position(|entry| entry.request_id.as_deref() == Some(request_id))
        else {
            return Ok(DeleteResult::NotFound);
        };
        let entry = queue.waiting.remove(index).expect("queue index exists");
        let _ = entry.sender.send(TurnPermit::Removed);
        Ok(DeleteResult::Deleted)
    }

    /// Runs a durable deletion while the queue state is locked, then removes
    /// the waiting entry only when the durable action succeeds.
    ///
    /// # Errors
    ///
    /// Returns the caller error when either queue synchronization or the
    /// durable deletion fails.
    pub fn delete_request_with<E>(
        &self,
        conversation_id: &str,
        request_id: &str,
        delete: impl FnOnce() -> Result<(), E>,
    ) -> Result<DeleteResult, E>
    where
        E: From<TurnQueueError>,
    {
        let mut registry = lock_registry(&self.state).map_err(E::from)?;
        let Some(queue) = registry.conversations.get_mut(conversation_id) else {
            delete()?;
            return Ok(DeleteResult::NotFound);
        };
        if queue
            .active
            .as_ref()
            .is_some_and(|entry| entry.request_id.as_deref() == Some(request_id))
        {
            return Ok(DeleteResult::Active);
        }
        let index = queue
            .waiting
            .iter()
            .position(|entry| entry.request_id.as_deref() == Some(request_id));
        delete()?;
        let Some(index) = index else {
            return Ok(DeleteResult::NotFound);
        };
        let entry = queue.waiting.remove(index).expect("queue index exists");
        let _ = entry.sender.send(TurnPermit::Removed);
        Ok(DeleteResult::Deleted)
    }

    fn register(
        &self,
        conversation_id: &str,
        request_id: Option<String>,
        cancellation: Option<ChatCancellationToken>,
    ) -> Result<(Uuid, oneshot::Receiver<TurnPermit>), TurnQueueError> {
        let mut registry = lock_registry(&self.state)?;
        let queue = registry
            .conversations
            .entry(conversation_id.to_owned())
            .or_default();
        if let Some(request_id) = request_id.as_deref()
            && contains_request(queue, request_id)
        {
            return Err(TurnQueueError::DuplicateRequest(request_id.to_owned()));
        }
        let entry_id = Uuid::new_v4();
        let (sender, receiver) = oneshot::channel();
        queue.waiting.push_back(WaitingEntry {
            entry_id,
            request_id,
            cancellation,
            sender,
        });
        promote_next(queue);
        Ok((entry_id, receiver))
    }
}
