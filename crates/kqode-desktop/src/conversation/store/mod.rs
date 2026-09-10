mod connection;
mod error;
mod mutation;
mod page;
mod pending;
mod query;
mod stream;

#[cfg(test)]
mod pending_tests;
#[cfg(test)]
mod tests;

pub use connection::ConversationStore;
pub(crate) use error::StoreError;
pub use kqode_core::conversation::{ConversationListItem, PendingTurn};
pub(crate) use kqode_core::conversation::{StoredMessage, StoredMessageRole};
pub(crate) use page::{ConversationHeader, MessagePage, StoredMessageRecord, StoredMessageStatus};
pub(crate) use pending::worker::PendingWork;

pub type Conversation = kqode_core::conversation::Conversation<crate::settings::Provider>;
