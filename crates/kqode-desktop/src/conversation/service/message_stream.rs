use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::{
    conversation::store::PendingTurn,
    inference::{ChatDelta, ChatDeltaHandler},
};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationMessageStream {
    pub(crate) conversation_id: String,
    pub(crate) turn_id: String,
    pub(crate) user_message_id: String,
    pub(crate) user_content: String,
    pub(crate) message_id: String,
    pub(crate) content: String,
    pub(crate) model: Option<String>,
}

pub(crate) type ConversationMessageStreamHandler =
    Arc<dyn Fn(ConversationMessageStream) + Send + Sync>;

#[derive(Clone, Default)]
pub(super) struct StreamedCompletion {
    pub(super) content: String,
    pub(super) model: Option<String>,
}

pub(super) fn stream_delta_handler(
    conversation_id: &str,
    pending: &PendingTurn,
    user_message_id: &str,
    message_id: &str,
    streamed: Arc<Mutex<StreamedCompletion>>,
    stream_handler: Option<ConversationMessageStreamHandler>,
) -> ChatDeltaHandler {
    let conversation_id = conversation_id.to_owned();
    let turn_id = pending.id.clone();
    let user_message_id = user_message_id.to_owned();
    let user_content = pending.content.clone();
    let message_id = message_id.to_owned();
    if let Some(handler) = &stream_handler {
        handler(ConversationMessageStream {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            user_message_id: user_message_id.clone(),
            user_content: user_content.clone(),
            message_id: message_id.clone(),
            content: String::new(),
            model: None,
        });
    }
    Arc::new(move |delta: ChatDelta| {
        let snapshot = {
            let mut streamed = streamed.lock().expect("streamed completion mutex poisoned");
            streamed.content.push_str(&delta.content);
            if delta.model.is_some() {
                streamed.model = delta.model;
            }
            streamed.clone()
        };
        if let Some(handler) = &stream_handler {
            handler(ConversationMessageStream {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                user_message_id: user_message_id.clone(),
                user_content: user_content.clone(),
                message_id: message_id.clone(),
                content: snapshot.content,
                model: snapshot.model,
            });
        }
    })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::{
        ConversationMessageStream, ConversationMessageStreamHandler, StreamedCompletion,
        stream_delta_handler,
    };
    use crate::{conversation::store::PendingTurn, inference::ChatDelta};

    #[test]
    fn emits_the_user_message_before_the_first_delta() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let stream_handler: ConversationMessageStreamHandler = {
            let events = Arc::clone(&events);
            Arc::new(move |event| events.lock().unwrap().push(event))
        };
        let streamed = Arc::new(Mutex::new(StreamedCompletion::default()));
        let handler = stream_delta_handler(
            "conversation-1",
            &PendingTurn {
                id: "turn-1".to_owned(),
                content: "Explain this code".to_owned(),
                retry_error_id: None,
                is_active: true,
            },
            "turn-1",
            "assistant-1",
            streamed,
            Some(stream_handler),
        );

        handler(ChatDelta {
            content: "Hello".to_owned(),
            model: Some("test-model".to_owned()),
        });

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(
            events[0],
            ConversationMessageStream {
                conversation_id: "conversation-1".to_owned(),
                turn_id: "turn-1".to_owned(),
                user_message_id: "turn-1".to_owned(),
                user_content: "Explain this code".to_owned(),
                message_id: "assistant-1".to_owned(),
                content: String::new(),
                model: None,
            }
        );
        assert_eq!(events[1].content, "Hello");
    }
}
