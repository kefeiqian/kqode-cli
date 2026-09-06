use std::sync::{Arc, Mutex};

use super::{
    ConversationMessageStreamHandler, ConversationServiceError, SendMessageResult,
    TitleGenerationRequest, archive_conversation, create_conversation, delete_turn,
    generate_conversation_title, list_conversations, load_conversation, process_pending_turn,
    retry_message, send_message, steer_turn, update_conversation,
};
use crate::{
    conversation::store::{Conversation, ConversationListItem, ConversationStore},
    llm::LlmService,
    settings::Provider,
};
use kqode_core::runtime::{QueuedTurn, TurnQueue};

/// Application boundary for conversation use cases.
#[derive(Clone)]
pub(crate) struct ConversationService {
    store: Arc<Mutex<ConversationStore>>,
    llm: LlmService,
    queue: TurnQueue,
}

impl ConversationService {
    pub(crate) fn new(
        store: Arc<Mutex<ConversationStore>>,
        llm: LlmService,
        queue: TurnQueue,
    ) -> Self {
        Self { store, llm, queue }
    }

    pub(crate) fn list(&self) -> Result<Vec<ConversationListItem>, ConversationServiceError> {
        list_conversations(self.store.as_ref())
    }

    pub(crate) fn load(
        &self,
        conversation_id: &str,
    ) -> Result<Conversation, ConversationServiceError> {
        self.with_active_turn(load_conversation(conversation_id, self.store.as_ref())?)
    }

    pub(crate) fn create(
        &self,
        workspace_path: Option<String>,
        provider: Option<Provider>,
        model: Option<String>,
    ) -> Result<Conversation, ConversationServiceError> {
        create_conversation(workspace_path, provider, model, self.store.as_ref())
    }

    pub(crate) async fn archive(
        &self,
        conversation_id: &str,
    ) -> Result<(), ConversationServiceError> {
        archive_conversation(conversation_id, self.store.as_ref(), &self.queue).await
    }

    pub(crate) async fn update(
        &self,
        conversation_id: &str,
        title: Option<String>,
        provider: Option<Provider>,
        model: Option<String>,
    ) -> Result<Conversation, ConversationServiceError> {
        update_conversation(
            conversation_id,
            title,
            provider,
            model,
            self.store.as_ref(),
            &self.queue,
        )
        .await
    }

    pub(crate) async fn send(
        &self,
        conversation_id: &str,
        message_id: String,
        content: String,
        stream_handler: Option<ConversationMessageStreamHandler>,
    ) -> Result<SendMessageResult, ConversationServiceError> {
        send_message(
            conversation_id,
            message_id,
            content,
            self.store.as_ref(),
            &self.llm,
            &self.queue,
            stream_handler,
        )
        .await
    }

    pub(crate) async fn retry(
        &self,
        conversation_id: &str,
        error_message_id: &str,
        turn_id: String,
        stream_handler: Option<ConversationMessageStreamHandler>,
    ) -> Result<SendMessageResult, ConversationServiceError> {
        retry_message(
            conversation_id,
            error_message_id,
            turn_id,
            self.store.as_ref(),
            &self.llm,
            &self.queue,
            stream_handler,
        )
        .await
    }

    pub(crate) fn steer(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<super::SteerTurnResult, ConversationServiceError> {
        let mut result = steer_turn(conversation_id, turn_id, self.store.as_ref(), &self.queue)?;
        result.conversation = self.with_active_turn(result.conversation)?;
        Ok(result)
    }

    pub(crate) async fn run_queued(
        &self,
        conversation_id: &str,
        turn_id: &str,
        queued: QueuedTurn,
        stream_handler: Option<ConversationMessageStreamHandler>,
    ) -> Result<SendMessageResult, ConversationServiceError> {
        process_pending_turn(
            conversation_id,
            turn_id,
            queued,
            self.store.as_ref(),
            &self.llm,
            stream_handler,
        )
        .await
    }

    pub(crate) fn delete_turn(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<Conversation, ConversationServiceError> {
        self.with_active_turn(delete_turn(
            conversation_id,
            turn_id,
            self.store.as_ref(),
            &self.queue,
        )?)
    }

    pub(crate) async fn generate_title(
        &self,
        request: TitleGenerationRequest,
    ) -> Result<Option<Conversation>, ConversationServiceError> {
        let conversation =
            generate_conversation_title(request, self.store.as_ref(), &self.llm).await?;
        conversation
            .map(|conversation| self.with_active_turn(conversation))
            .transpose()
    }

    pub(crate) fn with_active_turn(
        &self,
        mut conversation: Conversation,
    ) -> Result<Conversation, ConversationServiceError> {
        let active_id = self.queue.active_request_id(&conversation.id)?;
        for turn in &mut conversation.pending_turns {
            turn.is_active = active_id.as_deref() == Some(&turn.id);
        }
        Ok(conversation)
    }
}
