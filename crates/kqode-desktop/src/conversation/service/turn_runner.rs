use std::sync::{Arc, Mutex};

use uuid::Uuid;

use super::{
    error::ConversationServiceError,
    message_stream::{ConversationMessageStreamHandler, StreamedCompletion, stream_delta_handler},
    state::{lock_conversations, require_conversation},
    title::TitleGenerationRequest,
    transcript::{
        append_user_message, chat_messages, retry_user_message_id, stored_message,
        stored_message_with_id,
    },
};
use crate::{
    conversation::store::{Conversation, ConversationStore, StoredMessageRole},
    inference::{ChatError, ChatMode, ChatRequestOptions},
    llm::LlmService,
};
use kqode_core::runtime::QueuedTurn;

#[derive(Debug)]
pub(crate) struct SendMessageResult {
    pub(crate) conversation: Conversation,
    pub(crate) title_generation: Option<TitleGenerationRequest>,
}

pub(crate) async fn process_pending_turn(
    conversation_id: &str,
    turn_id: &str,
    queued: QueuedTurn,
    conversation_store: &Mutex<ConversationStore>,
    llm_service: &LlmService,
    stream_handler: Option<ConversationMessageStreamHandler>,
) -> Result<SendMessageResult, ConversationServiceError> {
    let Some(lease) = queued.acquire().await? else {
        return current_result(conversation_id, conversation_store);
    };
    let (mut conversation, pending, expected_title, user_message_id) = {
        let mut store = lock_conversations(conversation_store)?;
        let mut conversation = require_conversation(&store, conversation_id)?;
        let Some(pending) = store.load_pending_turn(conversation_id, turn_id)? else {
            drop(store);
            return current_result(conversation_id, conversation_store);
        };
        let (retry_error_index, user_message_id) = retry_user_message_id(&conversation, &pending);
        if let Some(index) = retry_error_index {
            conversation.messages.remove(index);
        }
        let expected_title = append_user_message(&mut conversation, &pending);
        if expected_title.is_some() {
            store.save_conversation(&mut conversation)?;
        } else {
            store.save_messages(&mut conversation)?;
        }
        (conversation, pending, expected_title, user_message_id)
    };
    let first_user_message = expected_title
        .as_ref()
        .and_then(|_| conversation.messages.last())
        .map(|message| message.content.clone());
    let cancellation = lease
        .cancellation()
        .expect("request turns always carry cancellation state");
    let assistant_message_id = Uuid::new_v4().to_string();
    let streamed = Arc::new(Mutex::new(StreamedCompletion::default()));
    let completion = llm_service
        .chat_cancellable_with_deltas(
            conversation.provider,
            conversation.model.clone(),
            chat_messages(&conversation),
            ChatMode::default(),
            ChatRequestOptions::streaming_for_conversation(
                conversation_id,
                cancellation.clone(),
                stream_delta_handler(
                    conversation_id,
                    &pending,
                    &user_message_id,
                    &assistant_message_id,
                    Arc::clone(&streamed),
                    stream_handler,
                ),
            ),
        )
        .await;

    let title_generation = apply_completion(
        &mut conversation,
        assistant_message_id,
        completion,
        cancellation.is_cancelled(),
        &streamed,
        expected_title,
        first_user_message,
    );
    lock_conversations(conversation_store)?
        .save_messages_and_remove_pending_turn(&mut conversation, &pending.id)?;
    Ok(SendMessageResult {
        conversation,
        title_generation,
    })
}

fn apply_completion(
    conversation: &mut Conversation,
    assistant_message_id: String,
    completion: Result<crate::inference::ChatCompletion, ChatError>,
    cancelled: bool,
    streamed: &Mutex<StreamedCompletion>,
    expected_title: Option<String>,
    first_user_message: Option<String>,
) -> Option<TitleGenerationRequest> {
    match completion {
        Ok(completion) if !cancelled => {
            let title =
                expected_title
                    .zip(first_user_message)
                    .map(|(expected_title, user_message)| {
                        TitleGenerationRequest::new(
                            conversation,
                            expected_title,
                            user_message,
                            completion.message.clone(),
                        )
                    });
            conversation.messages.push(stored_message_with_id(
                assistant_message_id,
                StoredMessageRole::Assistant,
                completion.message,
                Some(completion.model),
            ));
            title
        }
        Ok(_) => None,
        Err(ChatError::Cancelled) => {
            let partial = streamed
                .lock()
                .expect("streamed completion mutex poisoned")
                .clone();
            if !partial.content.trim().is_empty() {
                conversation.messages.push(stored_message_with_id(
                    assistant_message_id,
                    StoredMessageRole::Assistant,
                    partial.content,
                    partial.model,
                ));
            }
            None
        }
        Err(error) => {
            conversation.messages.push(stored_message(
                StoredMessageRole::Error,
                error.to_string(),
                None,
            ));
            None
        }
    }
}

fn current_result(
    conversation_id: &str,
    store: &Mutex<ConversationStore>,
) -> Result<SendMessageResult, ConversationServiceError> {
    let store = lock_conversations(store)?;
    Ok(SendMessageResult {
        conversation: require_conversation(&store, conversation_id)?,
        title_generation: None,
    })
}
