mod connection;
mod error;
mod mutation;
mod pending;
mod query;
mod schema;

#[cfg(test)]
mod pending_tests;
#[cfg(test)]
mod tests;

pub use connection::ConversationStore;
pub(crate) use error::StoreError;
pub use kqode_core::conversation::{ConversationListItem, PendingTurn};
pub(crate) use kqode_core::conversation::{StoredMessage, StoredMessageRole};

pub type Conversation = kqode_core::conversation::Conversation<crate::settings::Provider>;

pub(crate) use schema::migrate as migrate_schema;
