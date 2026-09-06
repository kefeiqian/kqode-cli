use std::sync::Mutex;

use super::{
    error::ConversationServiceError,
    state::{lock_conversations, require_conversation},
};
use crate::{
    conversation::store::{Conversation, ConversationStore},
    settings::Provider,
};
use kqode_core::runtime::TurnQueue;

pub(crate) async fn update_conversation(
    conversation_id: &str,
    title: Option<String>,
    provider: Option<Provider>,
    model: Option<String>,
    store: &Mutex<ConversationStore>,
    turn_queue: &TurnQueue,
) -> Result<Conversation, ConversationServiceError> {
    let _turn = turn_queue.acquire(conversation_id).await?;
    let mut store = lock_conversations(store)?;
    let mut conversation = require_conversation(&store, conversation_id)?;
    if let Some(title) = title {
        let title = title.trim();
        if title.is_empty() {
            return Err(ConversationServiceError::EmptyTitle);
        }
        if conversation.messages.is_empty() {
            return Err(ConversationServiceError::EmptyConversationRename);
        }
        conversation.title = title.to_owned();
    }
    conversation.provider = provider;
    conversation.model = model;
    store.save_conversation(&mut conversation)?;
    Ok(conversation)
}
