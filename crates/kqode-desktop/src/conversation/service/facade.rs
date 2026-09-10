use std::sync::{Arc, Mutex};

use super::{
    ConversationMessageStreamHandler, ConversationServiceError, ConversationView, MessagePageView,
    MessageView, SendMessageResult, TitleGenerationRequest, archive_conversation,
    create_conversation, delete_turn, generate_conversation_title, list_conversations,
    process_pending_turn, retry_message, send_message, steer_turn, update_conversation,
    view::MESSAGE_PAGE_SIZE,
};
use crate::{
    conversation::{
        store::{ConversationListItem, ConversationStore, PendingWork},
        worker::ConversationWorkItem,
    },
    llm::LlmService,
    settings::Provider,
};
use kqode_core::runtime::{QueuedTurn, TurnQueue, TurnQueueError};

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
    ) -> Result<ConversationView, ConversationServiceError> {
        self.load_view(conversation_id)
    }

    pub(crate) fn create(
        &self,
        workspace_path: Option<String>,
        provider: Option<Provider>,
        model: Option<String>,
    ) -> Result<ConversationView, ConversationServiceError> {
        let conversation =
            create_conversation(workspace_path, provider, model, self.store.as_ref())?;
        self.load_view(&conversation.id)
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
    ) -> Result<ConversationView, ConversationServiceError> {
        let conversation = update_conversation(
            conversation_id,
            title,
            provider,
            model,
            self.store.as_ref(),
            &self.queue,
        )
        .await?;
        self.load_view(&conversation.id)
    }

    pub(crate) fn send(
        &self,
        conversation_id: &str,
        content: String,
    ) -> Result<ConversationView, ConversationServiceError> {
        send_message(conversation_id, content, self.store.as_ref(), &self.llm)?;
        self.load_view(conversation_id)
    }

    pub(crate) fn retry(
        &self,
        conversation_id: &str,
        error_message_id: &str,
    ) -> Result<ConversationView, ConversationServiceError> {
        retry_message(
            conversation_id,
            error_message_id,
            self.store.as_ref(),
            &self.llm,
        )?;
        self.load_view(conversation_id)
    }

    pub(crate) fn steer(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<ConversationView, ConversationServiceError> {
        let result = steer_turn(conversation_id, turn_id, self.store.as_ref(), &self.queue)?;
        let conversation_id = result.conversation.id;
        let mut view = self.load_view(&conversation_id)?;
        for turn in &mut view.pending_turns {
            turn.is_active = turn.id == turn_id;
        }
        Ok(view)
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
            &self.store,
            &self.llm,
            stream_handler,
        )
        .await
    }

    pub(crate) fn delete_turn(
        &self,
        conversation_id: &str,
        turn_id: &str,
    ) -> Result<ConversationView, ConversationServiceError> {
        delete_turn(conversation_id, turn_id, self.store.as_ref(), &self.queue)?;
        self.load_view(conversation_id)
    }

    pub(crate) async fn generate_title(
        &self,
        request: TitleGenerationRequest,
    ) -> Result<Option<ConversationView>, ConversationServiceError> {
        let conversation =
            generate_conversation_title(request, self.store.as_ref(), &self.llm).await?;
        conversation
            .map(|conversation| self.load_view(&conversation.id))
            .transpose()
    }

    pub(crate) fn load_older_messages(
        &self,
        conversation_id: &str,
        before_position: i64,
    ) -> Result<MessagePageView, ConversationServiceError> {
        let store = self
            .store
            .lock()
            .map_err(|error| ConversationServiceError::Lock(error.to_string()))?;
        Ok(store
            .load_message_page(conversation_id, Some(before_position), MESSAGE_PAGE_SIZE)?
            .into())
    }

    pub(crate) fn load_message(
        &self,
        conversation_id: &str,
        message_id: &str,
    ) -> Result<MessageView, ConversationServiceError> {
        let store = self
            .store
            .lock()
            .map_err(|error| ConversationServiceError::Lock(error.to_string()))?;
        store
            .load_message_record(conversation_id, message_id)?
            .map(MessageView::from)
            .ok_or_else(|| ConversationServiceError::MessageNotFound(message_id.to_owned()))
    }

    fn load_view(
        &self,
        conversation_id: &str,
    ) -> Result<ConversationView, ConversationServiceError> {
        let (mut header, page) = {
            let store = self
                .store
                .lock()
                .map_err(|error| ConversationServiceError::Lock(error.to_string()))?;
            let header = store
                .load_conversation_header(conversation_id)?
                .ok_or_else(|| ConversationServiceError::NotFound(conversation_id.to_owned()))?;
            let page = store.load_message_page(conversation_id, None, MESSAGE_PAGE_SIZE)?;
            (header, MessagePageView::from(page))
        };
        let active_id = self.queue.active_request_id(conversation_id)?;
        for turn in &mut header.pending_turns {
            turn.is_active = active_id.as_deref() == Some(&turn.id);
        }
        Ok(ConversationView::new(header, page))
    }

    pub(crate) fn claim_pending_work(
        &self,
    ) -> Result<Vec<ConversationWorkItem>, ConversationServiceError> {
        let queued_work = self
            .store
            .lock()
            .map_err(|error| ConversationServiceError::Lock(error.to_string()))?
            .claim_queued_work()?;
        let mut claimed = Vec::with_capacity(queued_work.len());
        for (index, work) in queued_work.iter().enumerate() {
            let queued = match self
                .queue
                .enqueue_request(&work.conversation_id, &work.turn_id)
            {
                Ok(queued) => queued,
                Err(TurnQueueError::DuplicateRequest(_)) => continue,
                Err(error) => {
                    self.rollback_claimed_work(&queued_work[index..], claimed)?;
                    return Err(error.into());
                }
            };
            claimed.push(ConversationWorkItem {
                conversation_id: work.conversation_id.clone(),
                turn_id: work.turn_id.clone(),
                queued,
            });
        }
        Ok(claimed)
    }

    fn rollback_claimed_work(
        &self,
        unclaimed: &[PendingWork],
        claimed: Vec<ConversationWorkItem>,
    ) -> Result<(), ConversationServiceError> {
        let store = self
            .store
            .lock()
            .map_err(|error| ConversationServiceError::Lock(error.to_string()))?;
        for work in unclaimed {
            store.mark_pending_turn_queued(&work.conversation_id, &work.turn_id)?;
        }
        for work in &claimed {
            store.mark_pending_turn_queued(&work.conversation_id, &work.turn_id)?;
        }
        drop(store);
        for work in claimed {
            work.queued.abandon()?;
        }
        Ok(())
    }

    pub(crate) fn fail_pending_work(
        &self,
        conversation_id: &str,
        turn_id: &str,
        error: &str,
    ) -> Result<(), ConversationServiceError> {
        self.store
            .lock()
            .map_err(|lock_error| ConversationServiceError::Lock(lock_error.to_string()))?
            .fail_pending_turn(conversation_id, turn_id, error)?;
        Ok(())
    }
}
