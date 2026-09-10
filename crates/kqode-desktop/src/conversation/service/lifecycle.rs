use std::sync::Mutex;

use uuid::Uuid;

use super::{
    constants::DEFAULT_CONVERSATION_TITLE, error::ConversationServiceError,
    state::lock_conversations,
};
use crate::{
    conversation::store::{Conversation, ConversationListItem, ConversationStore},
    settings::Provider,
};
use kqode_core::runtime::TurnQueue;

pub(crate) fn list_conversations(
    conversation_store: &Mutex<ConversationStore>,
) -> Result<Vec<ConversationListItem>, ConversationServiceError> {
    Ok(lock_conversations(conversation_store)?.list_conversations()?)
}

pub(crate) fn create_conversation(
    workspace_path: Option<String>,
    provider: Option<Provider>,
    model: Option<String>,
    conversation_store: &Mutex<ConversationStore>,
) -> Result<Conversation, ConversationServiceError> {
    let mut store = lock_conversations(conversation_store)?;
    if let Some(mut conversation) = store.find_empty_conversation()? {
        if conversation.workspace_path != workspace_path
            || conversation.provider != provider
            || conversation.model != model
        {
            conversation.workspace_path = workspace_path;
            conversation.provider = provider;
            conversation.model = model;
            store.save_conversation(&mut conversation)?;
        }
        return Ok(conversation);
    }

    let mut conversation = Conversation {
        id: Uuid::new_v4().to_string(),
        title: DEFAULT_CONVERSATION_TITLE.to_owned(),
        updated_at: 0,
        workspace_path,
        provider,
        model,
        messages: Vec::new(),
        pending_turns: Vec::new(),
    };
    store.save_conversation(&mut conversation)?;
    Ok(conversation)
}

pub(crate) async fn archive_conversation(
    conversation_id: &str,
    conversation_store: &Mutex<ConversationStore>,
    turn_queue: &TurnQueue,
) -> Result<(), ConversationServiceError> {
    let _turn = turn_queue.acquire(conversation_id).await?;
    lock_conversations(conversation_store)?.archive_conversation(conversation_id)?;
    Ok(())
}
