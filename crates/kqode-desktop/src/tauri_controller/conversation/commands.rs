use tauri::{AppHandle, State};

use super::{
    events::stream_handler,
    tasks::{finish_send, run_queued},
};
use crate::{
    conversation::{
        service::ConversationService,
        store::{Conversation, ConversationListItem},
    },
    settings::Provider,
};

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
) -> Result<Conversation, String> {
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
) -> Result<Conversation, String> {
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
) -> Result<Conversation, String> {
    service
        .update(&conversation_id, title, provider, model)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn send_message(
    conversation_id: String,
    message_id: String,
    content: String,
    app: AppHandle,
    service: State<'_, ConversationService>,
) -> Result<Conversation, String> {
    let result = service
        .send(
            &conversation_id,
            message_id,
            content,
            Some(stream_handler(&app)),
        )
        .await
        .map_err(|error| error.to_string())?;
    finish_send(app, service.inner().clone(), result)
}

#[tauri::command]
pub(crate) async fn steer_conversation_turn(
    conversation_id: String,
    turn_id: String,
    app: AppHandle,
    service: State<'_, ConversationService>,
) -> Result<Conversation, String> {
    let result = service
        .steer(&conversation_id, &turn_id)
        .map_err(|error| error.to_string())?;
    if let Some(queued) = result.waiter {
        run_queued(
            app,
            service.inner().clone(),
            conversation_id,
            turn_id,
            queued,
        );
    }
    Ok(result.conversation)
}

#[tauri::command]
pub(crate) fn delete_conversation_turn(
    conversation_id: String,
    turn_id: String,
    service: State<'_, ConversationService>,
) -> Result<Conversation, String> {
    service
        .delete_turn(&conversation_id, &turn_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn retry_message(
    conversation_id: String,
    error_message_id: String,
    turn_id: String,
    app: AppHandle,
    service: State<'_, ConversationService>,
) -> Result<Conversation, String> {
    let result = service
        .retry(
            &conversation_id,
            &error_message_id,
            turn_id,
            Some(stream_handler(&app)),
        )
        .await
        .map_err(|error| error.to_string())?;
    finish_send(app, service.inner().clone(), result)
}
