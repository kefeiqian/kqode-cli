use std::{error::Error, fmt};

/// Failure while coordinating turns that share a queue key.
#[derive(Debug)]
pub enum TurnQueueError {
    DuplicateRequest(String),
    EntryRemoved(String),
    Lock(String),
    Wait(String),
}

impl fmt::Display for TurnQueueError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateRequest(id) => write!(formatter, "message {id} is already pending"),
            Self::EntryRemoved(id) => write!(formatter, "queued turn {id} was removed"),
            Self::Lock(error) => write!(formatter, "lock prompt queue: {error}"),
            Self::Wait(error) => write!(formatter, "wait for conversation turn: {error}"),
        }
    }
}

impl Error for TurnQueueError {}
