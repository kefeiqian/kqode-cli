use std::sync::{Arc, Mutex};

use uuid::Uuid;

use super::{
    ConversationMessageStreamHandler, ConversationServiceError, TitleGenerationRequest,
    message_stream::{StreamedCompletion, flush_streamed_completion, stream_delta_handler},
    state::{lock_conversations, require_conversation},
    title::provisional_title,
    transcript::{chat_messages, retry_user_message_id},
};
use crate::{
    conversation::store::{ConversationStore, StoredMessageRole},
    inference::{ChatError, ChatMode, ChatRequestOptions},
    llm::LlmService,
};
use kqode_core::runtime::QueuedTurn;

#[derive(Debug)]
pub(crate) struct SendMessageResult {
    pub(crate) title_generation: Option<TitleGenerationRequest>,
}

pub(crate) async fn process_pending_turn(
    conversation_id: &str,
    turn_id: &str,
    queued: QueuedTurn,
    conversation_store: &Arc<Mutex<ConversationStore>>,
    llm_service: &LlmService,
    stream_handler: Option<ConversationMessageStreamHandler>,
) -> Result<SendMessageResult, ConversationServiceError> {
    let Some(lease) = queued.acquire().await? else {
        return Ok(SendMessageResult {
            title_generation: None,
        });
    };
    let assistant_message_id = Uuid::new_v4().to_string();
    let (conversation, pending, expected_title, current_user_message_id) = {
        let mut store = lock_conversations(conversation_store)?;
        let mut conversation = require_conversation(&store, conversation_id)?;
        let Some(pending) = store.load_pending_turn(conversation_id, turn_id)? else {
            return Ok(SendMessageResult {
                title_generation: None,
            });
        };
        let (retry_error_index, current_user_message_id) =
            retry_user_message_id(&conversation, &pending);
        if let Some(index) = retry_error_index {
            conversation.messages.remove(index);
        }
        let expected_title = (pending.retry_error_id.is_none()
            && conversation.messages.len() == 1
            && conversation.messages[0].id == pending.id
            && conversation.title == provisional_title(&pending.content))
        .then(|| conversation.title.clone());
        store.begin_pending_turn(
            conversation_id,
            turn_id,
            pending.retry_error_id.as_deref(),
            &assistant_message_id,
        )?;
        (
            conversation,
            pending,
            expected_title,
            current_user_message_id,
        )
    };
    let first_user_message = expected_title.as_ref().map(|_| pending.content.clone());
    let cancellation = lease
        .cancellation()
        .expect("request turns always carry cancellation state");
    let streamed = Arc::new(Mutex::new(StreamedCompletion::default()));
    let completion = llm_service
        .chat_cancellable_with_deltas(
            conversation.provider,
            conversation.model.clone(),
            chat_messages(&conversation, &current_user_message_id),
            ChatMode::default(),
            ChatRequestOptions::streaming_for_conversation(
                conversation_id,
                cancellation.clone(),
                stream_delta_handler(
                    conversation_id,
                    turn_id,
                    &assistant_message_id,
                    cancellation.clone(),
                    Arc::clone(&streamed),
                    Arc::clone(conversation_store),
                    stream_handler.clone(),
                ),
            ),
        )
        .await;

    if let Err(error) = flush_streamed_completion(
        conversation_id,
        turn_id,
        &assistant_message_id,
        &streamed,
        conversation_store,
        &stream_handler,
        &cancellation,
    ) {
        lock_conversations(conversation_store)?.finish_pending_turn(
            conversation_id,
            turn_id,
            &assistant_message_id,
            StoredMessageRole::Error,
            &error.to_string(),
            None,
        )?;
        return Err(error);
    }

    let (streamed_content, streamed_model) = {
        let streamed = streamed.lock().expect("streamed completion mutex poisoned");
        (streamed.content.clone(), streamed.model.clone())
    };
    let title_generation = match completion {
        Ok(completion) if !cancellation.is_cancelled() => {
            lock_conversations(conversation_store)?.finish_pending_turn(
                conversation_id,
                turn_id,
                &assistant_message_id,
                StoredMessageRole::Assistant,
                &completion.message,
                Some(&completion.model),
            )?;
            expected_title
                .zip(first_user_message)
                .map(|(expected_title, user_message)| {
                    TitleGenerationRequest::new(
                        &conversation,
                        expected_title,
                        user_message,
                        completion.message,
                    )
                })
        }
        Ok(_) | Err(ChatError::Cancelled) if streamed_content.trim().is_empty() => {
            lock_conversations(conversation_store)?.discard_pending_stream(
                conversation_id,
                turn_id,
                &assistant_message_id,
            )?;
            None
        }
        Ok(_) | Err(ChatError::Cancelled) => {
            lock_conversations(conversation_store)?.finish_pending_turn(
                conversation_id,
                turn_id,
                &assistant_message_id,
                StoredMessageRole::Assistant,
                &streamed_content,
                streamed_model.as_deref(),
            )?;
            None
        }
        Err(error) => {
            lock_conversations(conversation_store)?.finish_pending_turn(
                conversation_id,
                turn_id,
                &assistant_message_id,
                StoredMessageRole::Error,
                &error.to_string(),
                None,
            )?;
            None
        }
    };
    Ok(SendMessageResult { title_generation })
}
