use crate::{
    conversation::{
        service::{ConversationService, ConversationView, MessagePageView, MessageView},
        store::ConversationListItem,
    },
    settings::Provider,
};
use tauri::State;

#[tauri::command]
pub(crate) fn list_conversations(
    service: State<'_, ConversationService>,
) -> Result<Vec<ConversationListItem>, String> {
    service.list().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn load_conversation(
    conversation_id: String,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .load(&conversation_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn create_conversation(
    workspace_path: Option<String>,
    provider: Option<Provider>,
    model: Option<String>,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .create(workspace_path, provider, model)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn archive_conversation(
    conversation_id: String,
    service: State<'_, ConversationService>,
) -> Result<(), String> {
    service
        .archive(&conversation_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn update_conversation(
    conversation_id: String,
    title: Option<String>,
    provider: Option<Provider>,
    model: Option<String>,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .update(&conversation_id, title, provider, model)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn send_message(
    conversation_id: String,
    content: String,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .send(&conversation_id, content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn steer_conversation_turn(
    conversation_id: String,
    turn_id: String,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .steer(&conversation_id, &turn_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn delete_conversation_turn(
    conversation_id: String,
    turn_id: String,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .delete_turn(&conversation_id, &turn_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn retry_message(
    conversation_id: String,
    error_message_id: String,
    service: State<'_, ConversationService>,
) -> Result<ConversationView, String> {
    service
        .retry(&conversation_id, &error_message_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn load_older_conversation_messages(
    conversation_id: String,
    before_position: i64,
    service: State<'_, ConversationService>,
) -> Result<MessagePageView, String> {
    service
        .load_older_messages(&conversation_id, before_position)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn load_conversation_message(
    conversation_id: String,
    message_id: String,
    service: State<'_, ConversationService>,
) -> Result<MessageView, String> {
    service
        .load_message(&conversation_id, &message_id)
        .map_err(|error| error.to_string())
}
