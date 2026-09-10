use std::{error::Error, fmt};

use crate::{conversation::store::StoreError, inference::ChatError};
use kqode_core::runtime::TurnQueueError;

#[derive(Debug)]
pub(crate) enum ConversationServiceError {
    ActiveTurnCannotBeDeleted(String),
    DuplicateMessage(String),
    EmptyConversationRename,
    EmptyMessage,
    EmptyTitle,
    InvalidRetry(String),
    Lock(String),
    MessageNotFound(String),
    NotFound(String),
    PendingTurnNotFound(String),
    StreamPersistence(String),
    Llm(ChatError),
    TurnQueue(TurnQueueError),
    Store(StoreError),
}

impl fmt::Display for ConversationServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ActiveTurnCannotBeDeleted(id) => {
                write!(formatter, "active turn {id} cannot be deleted")
            }
            Self::DuplicateMessage(id) => write!(formatter, "message {id} is already pending"),
            Self::EmptyConversationRename => {
                formatter.write_str("an empty conversation cannot be renamed")
            }
            Self::EmptyMessage => formatter.write_str("message cannot be empty"),
            Self::EmptyTitle => formatter.write_str("conversation title cannot be empty"),
            Self::InvalidRetry(id) => write!(formatter, "message {id} cannot be retried"),
            Self::Lock(error) => write!(formatter, "lock application state: {error}"),
            Self::MessageNotFound(id) => write!(formatter, "message {id} was not found"),
            Self::NotFound(id) => write!(formatter, "conversation {id} was not found"),
            Self::PendingTurnNotFound(id) => write!(formatter, "queued turn {id} was not found"),
            Self::StreamPersistence(error) => {
                write!(formatter, "persist streamed response: {error}")
            }
            Self::Llm(error) => error.fmt(formatter),
            Self::TurnQueue(error) => error.fmt(formatter),
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for ConversationServiceError {}

impl From<ChatError> for ConversationServiceError {
    fn from(error: ChatError) -> Self {
        Self::Llm(error)
    }
}

impl From<TurnQueueError> for ConversationServiceError {
    fn from(error: TurnQueueError) -> Self {
        Self::TurnQueue(error)
    }
}

impl From<StoreError> for ConversationServiceError {
    fn from(error: StoreError) -> Self {
        Self::Store(error)
    }
}
