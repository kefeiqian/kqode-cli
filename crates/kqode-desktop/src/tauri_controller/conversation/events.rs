use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::conversation::{
    service::{ConversationMessageStream, ConversationMessageStreamHandler},
    store::Conversation,
};

const CONVERSATION_UPDATED_EVENT: &str = "conversation-updated";
const CONVERSATION_MESSAGE_STREAM_EVENT: &str = "conversation-message-stream";

pub(super) fn stream_handler(app: &AppHandle) -> ConversationMessageStreamHandler {
    let app = app.clone();
    Arc::new(move |message: ConversationMessageStream| {
        if let Err(error) = app.emit(CONVERSATION_MESSAGE_STREAM_EVENT, message) {
            eprintln!("emit conversation message stream: {error}");
        }
    })
}

pub(super) fn emit_update(app: &AppHandle, conversation: &Conversation) {
    if let Err(error) = app.emit(CONVERSATION_UPDATED_EVENT, conversation) {
        eprintln!("emit conversation update: {error}");
    }
}
