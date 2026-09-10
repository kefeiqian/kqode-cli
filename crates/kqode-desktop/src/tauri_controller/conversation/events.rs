use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::conversation::{
    service::{ConversationMessageStream, ConversationMessageStreamHandler},
    worker::ConversationUpdateHandler,
};

const CONVERSATION_UPDATED_EVENT: &str = "conversation-updated";
const CONVERSATION_MESSAGE_STREAM_EVENT: &str = "conversation-message-stream";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversationUpdated {
    conversation_id: String,
}

pub(crate) fn stream_handler(app: &AppHandle) -> ConversationMessageStreamHandler {
    let app = app.clone();
    Arc::new(move |message: ConversationMessageStream| {
        if let Err(error) = app.emit(CONVERSATION_MESSAGE_STREAM_EVENT, message) {
            eprintln!("emit conversation message stream: {error}");
        }
    })
}

pub(crate) fn update_handler(app: &AppHandle) -> ConversationUpdateHandler {
    let app = app.clone();
    Arc::new(move |conversation_id| {
        if let Err(error) = app.emit(
            CONVERSATION_UPDATED_EVENT,
            ConversationUpdated {
                conversation_id: conversation_id.to_owned(),
            },
        ) {
            eprintln!("emit conversation update: {error}");
        }
    })
}
