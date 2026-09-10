use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use serde::Serialize;

use super::{ConversationServiceError, state::lock_conversations};
use crate::{
    conversation::store::ConversationStore,
    inference::{ChatDelta, ChatDeltaHandler},
};
use kqode_core::cancellation::ChatCancellationToken;

const STREAM_CHECKPOINT_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationMessageStream {
    pub(crate) conversation_id: String,
    pub(crate) turn_id: String,
    pub(crate) message_id: String,
    pub(crate) revision: i64,
}

pub(crate) type ConversationMessageStreamHandler =
    Arc<dyn Fn(ConversationMessageStream) + Send + Sync>;

#[derive(Default)]
pub(super) struct StreamedCompletion {
    pub(super) content: String,
    pub(super) model: Option<String>,
    persisted_length: usize,
    last_checkpoint: Option<Instant>,
    persistence_error: Option<String>,
}

struct CheckpointContext<'a> {
    conversation_store: &'a Arc<Mutex<ConversationStore>>,
    streamed: &'a Arc<Mutex<StreamedCompletion>>,
    stream_handler: &'a Option<ConversationMessageStreamHandler>,
    conversation_id: &'a str,
    turn_id: &'a str,
    message_id: &'a str,
    cancellation: &'a ChatCancellationToken,
}

pub(super) fn stream_delta_handler(
    conversation_id: &str,
    turn_id: &str,
    message_id: &str,
    cancellation: ChatCancellationToken,
    streamed: Arc<Mutex<StreamedCompletion>>,
    conversation_store: Arc<Mutex<ConversationStore>>,
    stream_handler: Option<ConversationMessageStreamHandler>,
) -> ChatDeltaHandler {
    let conversation_id = conversation_id.to_owned();
    let turn_id = turn_id.to_owned();
    let message_id = message_id.to_owned();
    emit_message_update(&stream_handler, &conversation_id, &turn_id, &message_id, 0);
    Arc::new(move |delta: ChatDelta| {
        if cancellation.is_cancelled() {
            return;
        }
        let checkpoint = {
            let mut streamed = streamed.lock().expect("streamed completion mutex poisoned");
            if cancellation.is_cancelled() {
                return;
            }
            streamed.content.push_str(&delta.content);
            if delta.model.is_some() {
                streamed.model = delta.model;
            }
            let should_checkpoint = streamed
                .last_checkpoint
                .is_none_or(|last| last.elapsed() >= STREAM_CHECKPOINT_INTERVAL);
            should_checkpoint.then(|| (streamed.content.clone(), streamed.model.clone()))
        };
        let Some((content, model)) = checkpoint else {
            return;
        };
        let context = CheckpointContext {
            conversation_store: &conversation_store,
            streamed: &streamed,
            stream_handler: &stream_handler,
            conversation_id: &conversation_id,
            turn_id: &turn_id,
            message_id: &message_id,
            cancellation: &cancellation,
        };
        persist_checkpoint(&context, &content, model.as_deref());
    })
}

pub(super) fn flush_streamed_completion(
    conversation_id: &str,
    turn_id: &str,
    message_id: &str,
    streamed: &Arc<Mutex<StreamedCompletion>>,
    conversation_store: &Arc<Mutex<ConversationStore>>,
    stream_handler: &Option<ConversationMessageStreamHandler>,
    cancellation: &ChatCancellationToken,
) -> Result<(), ConversationServiceError> {
    let (content, model, needs_flush, persistence_error) = {
        let streamed = streamed.lock().expect("streamed completion mutex poisoned");
        (
            streamed.content.clone(),
            streamed.model.clone(),
            streamed.persisted_length != streamed.content.len(),
            streamed.persistence_error.clone(),
        )
    };
    if let Some(error) = persistence_error {
        return Err(ConversationServiceError::StreamPersistence(error));
    }
    if needs_flush {
        let context = CheckpointContext {
            conversation_store,
            streamed,
            stream_handler,
            conversation_id,
            turn_id,
            message_id,
            cancellation,
        };
        persist_checkpoint(&context, &content, model.as_deref());
    }
    let persistence_error = streamed
        .lock()
        .expect("streamed completion mutex poisoned")
        .persistence_error
        .clone();
    persistence_error.map_or(Ok(()), |error| {
        Err(ConversationServiceError::StreamPersistence(error))
    })
}

fn persist_checkpoint(context: &CheckpointContext<'_>, content: &str, model: Option<&str>) {
    let result = lock_conversations(context.conversation_store).and_then(|store| {
        store
            .update_streaming_message(context.conversation_id, context.message_id, content, model)
            .map_err(ConversationServiceError::from)
    });
    match result {
        Ok(revision) => {
            let mut streamed = context
                .streamed
                .lock()
                .expect("streamed completion mutex poisoned");
            streamed.persisted_length = content.len();
            streamed.last_checkpoint = Some(Instant::now());
            drop(streamed);
            if !context.cancellation.is_cancelled() {
                emit_message_update(
                    context.stream_handler,
                    context.conversation_id,
                    context.turn_id,
                    context.message_id,
                    revision,
                );
            }
        }
        Err(error) => {
            context
                .streamed
                .lock()
                .expect("streamed completion mutex poisoned")
                .persistence_error = Some(error.to_string());
        }
    }
}

fn emit_message_update(
    handler: &Option<ConversationMessageStreamHandler>,
    conversation_id: &str,
    turn_id: &str,
    message_id: &str,
    revision: i64,
) {
    if let Some(handler) = handler {
        handler(ConversationMessageStream {
            conversation_id: conversation_id.to_owned(),
            turn_id: turn_id.to_owned(),
            message_id: message_id.to_owned(),
            revision,
        });
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use rusqlite::Connection;

    use super::{ConversationMessageStreamHandler, StreamedCompletion, stream_delta_handler};
    use crate::{
        conversation::store::{
            Conversation, ConversationStore, PendingTurn, StoredMessage, StoredMessageRole,
        },
        inference::ChatDelta,
    };
    use kqode_core::cancellation::ChatCancellationToken;

    #[test]
    fn checkpoints_the_latest_stream_snapshot_before_notifying() {
        let store = Arc::new(Mutex::new(
            ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap(),
        ));
        let mut conversation = Conversation {
            id: "conversation-1".to_owned(),
            title: "Example".to_owned(),
            updated_at: 0,
            workspace_path: None,
            provider: None,
            model: None,
            messages: Vec::new(),
            pending_turns: Vec::new(),
        };
        store
            .lock()
            .unwrap()
            .save_conversation(&mut conversation)
            .unwrap();
        store
            .lock()
            .unwrap()
            .enqueue_message_turn(
                &conversation.id,
                &PendingTurn {
                    id: "turn-1".to_owned(),
                    content: "Explain this code".to_owned(),
                    retry_error_id: None,
                    is_active: false,
                },
                &StoredMessage {
                    id: "turn-1".to_owned(),
                    role: StoredMessageRole::User,
                    content: "Explain this code".to_owned(),
                    model: None,
                },
                None,
            )
            .unwrap();
        store
            .lock()
            .unwrap()
            .begin_pending_turn(&conversation.id, "turn-1", None, "assistant-1")
            .unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let stream_handler: ConversationMessageStreamHandler = {
            let events = Arc::clone(&events);
            Arc::new(move |event| events.lock().unwrap().push(event))
        };
        let cancellation = ChatCancellationToken::default();
        let handler = stream_delta_handler(
            &conversation.id,
            "turn-1",
            "assistant-1",
            cancellation,
            Arc::new(Mutex::new(StreamedCompletion::default())),
            Arc::clone(&store),
            Some(stream_handler),
        );

        handler(ChatDelta {
            content: "Hello".to_owned(),
            model: Some("test-model".to_owned()),
        });

        let message = store
            .lock()
            .unwrap()
            .load_message_record(&conversation.id, "assistant-1")
            .unwrap()
            .unwrap();
        assert_eq!(message.message.content, "Hello");
        let events = events.lock().unwrap();
        assert_eq!(events.last().unwrap().turn_id, "turn-1");
        assert_eq!(events.last().unwrap().revision, 1);
    }

    #[test]
    fn ignores_deltas_after_the_turn_is_cancelled() {
        let store = Arc::new(Mutex::new(
            ConversationStore::initialize(Connection::open_in_memory().unwrap()).unwrap(),
        ));
        let mut conversation = Conversation {
            id: "conversation-1".to_owned(),
            title: "Example".to_owned(),
            updated_at: 0,
            workspace_path: None,
            provider: None,
            model: None,
            messages: Vec::new(),
            pending_turns: Vec::new(),
        };
        store
            .lock()
            .unwrap()
            .save_conversation(&mut conversation)
            .unwrap();
        store
            .lock()
            .unwrap()
            .enqueue_message_turn(
                &conversation.id,
                &PendingTurn {
                    id: "turn-1".to_owned(),
                    content: "Explain this code".to_owned(),
                    retry_error_id: None,
                    is_active: false,
                },
                &StoredMessage {
                    id: "turn-1".to_owned(),
                    role: StoredMessageRole::User,
                    content: "Explain this code".to_owned(),
                    model: None,
                },
                None,
            )
            .unwrap();
        store
            .lock()
            .unwrap()
            .begin_pending_turn(&conversation.id, "turn-1", None, "assistant-1")
            .unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let stream_handler: ConversationMessageStreamHandler = {
            let events = Arc::clone(&events);
            Arc::new(move |event| events.lock().unwrap().push(event))
        };
        let cancellation = ChatCancellationToken::default();
        let handler = stream_delta_handler(
            &conversation.id,
            "turn-1",
            "assistant-1",
            cancellation.clone(),
            Arc::new(Mutex::new(StreamedCompletion::default())),
            Arc::clone(&store),
            Some(stream_handler),
        );
        cancellation.cancel();

        handler(ChatDelta {
            content: "Too late".to_owned(),
            model: Some("test-model".to_owned()),
        });

        let message = store
            .lock()
            .unwrap()
            .load_message_record(&conversation.id, "assistant-1")
            .unwrap()
            .unwrap();
        assert!(message.message.content.is_empty());
        assert_eq!(events.lock().unwrap().len(), 1);
    }
}
