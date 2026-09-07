use std::sync::{Arc, Mutex};

use kqode_core::runtime::TurnQueue;
use tauri::Manager;

use crate::{
    conversation::{service::ConversationService, store::ConversationStore},
    database,
    llm::LlmService,
    settings::{SettingsService, SettingsStore},
};

/// Initializes persistent stores and registers application services with Tauri.
///
/// # Errors
///
/// Returns an error when the application database or one of its stores cannot
/// be prepared.
pub(crate) fn initialize_application(
    app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    let database_path = database::prepare(app.handle())?;
    let settings_store = Arc::new(Mutex::new(SettingsStore::open(&database_path)?));
    let conversation_store = Arc::new(Mutex::new(ConversationStore::open(&database_path)?));
    let llm_service = LlmService::new(Arc::clone(&settings_store));
    let settings_service = SettingsService::new(settings_store);
    let turn_queue = TurnQueue::default();
    let conversation_service =
        ConversationService::new(conversation_store, llm_service.clone(), turn_queue);

    app.manage(settings_service);
    app.manage(llm_service);
    app.manage(conversation_service);
    Ok(())
}
