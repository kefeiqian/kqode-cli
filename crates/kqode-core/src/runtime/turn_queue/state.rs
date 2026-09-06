use std::{
    collections::{HashMap, VecDeque},
    sync::MutexGuard,
};

use tokio::sync::oneshot;
use uuid::Uuid;

use crate::cancellation::ChatCancellationToken;

use super::TurnQueueError;

#[derive(Default)]
pub(super) struct QueueRegistry {
    pub(super) conversations: HashMap<String, ConversationQueue>,
}

#[derive(Default)]
pub(super) struct ConversationQueue {
    pub(super) active: Option<ActiveEntry>,
    pub(super) waiting: VecDeque<WaitingEntry>,
}

pub(super) struct ActiveEntry {
    pub(super) entry_id: Uuid,
    pub(super) request_id: Option<String>,
    pub(super) cancellation: Option<ChatCancellationToken>,
}

pub(super) struct WaitingEntry {
    pub(super) entry_id: Uuid,
    pub(super) request_id: Option<String>,
    pub(super) cancellation: Option<ChatCancellationToken>,
    pub(super) sender: oneshot::Sender<TurnPermit>,
}

pub(super) enum TurnPermit {
    Acquired,
    Removed,
}

pub(super) fn lock_registry(
    registry: &std::sync::Mutex<QueueRegistry>,
) -> Result<MutexGuard<'_, QueueRegistry>, TurnQueueError> {
    registry
        .lock()
        .map_err(|error| TurnQueueError::Lock(error.to_string()))
}

pub(super) fn contains_request(queue: &ConversationQueue, request_id: &str) -> bool {
    queue
        .active
        .as_ref()
        .is_some_and(|entry| entry.request_id.as_deref() == Some(request_id))
        || queue
            .waiting
            .iter()
            .any(|entry| entry.request_id.as_deref() == Some(request_id))
}

pub(super) fn promote_next(queue: &mut ConversationQueue) {
    while queue.active.is_none() {
        let Some(entry) = queue.waiting.pop_front() else {
            return;
        };
        queue.active = Some(ActiveEntry {
            entry_id: entry.entry_id,
            request_id: entry.request_id,
            cancellation: entry.cancellation,
        });
        if entry.sender.send(TurnPermit::Acquired).is_ok() {
            return;
        }
        queue.active = None;
    }
}
