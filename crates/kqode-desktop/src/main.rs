// Prevents an additional console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod conversation;
mod database;
mod inference;
mod llm;
mod packaging;
#[cfg(test)]
mod provider_live_tests;
mod secrets;
mod settings;
mod tauri_controller;
mod tools;

use std::sync::{Arc, Mutex};

use tauri::Manager;

use conversation::{service::ConversationService, store::ConversationStore};
use kqode_core::runtime::TurnQueue;
use llm::LlmService;
use settings::{SettingsService, SettingsStore};

fn main() {
    packaging::run_requested_diagnostic();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            secrets::init_keychain_backend();
            let database_path = database::prepare(app.handle())?;
            let settings_store = Arc::new(Mutex::new(SettingsStore::open(&database_path)?));
            let conversation_store = Arc::new(Mutex::new(ConversationStore::open(&database_path)?));
            let llm_service = LlmService::new(Arc::clone(&settings_store));
            let settings_service = SettingsService::new(settings_store);
            let turn_queue = TurnQueue::default();
            let conversation_service =
                ConversationService::new(conversation_store, llm_service.clone(), turn_queue);
            app.manage(settings_service);
            app.manage(llm_service.clone());
            app.manage(conversation_service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tauri_controller::conversation::commands::archive_conversation,
            tauri_controller::conversation::commands::create_conversation,
            tauri_controller::conversation::commands::delete_conversation_turn,
            tauri_controller::conversation::commands::list_conversations,
            tauri_controller::conversation::commands::load_conversation,
            tauri_controller::conversation::commands::retry_message,
            tauri_controller::conversation::commands::send_message,
            tauri_controller::conversation::commands::steer_conversation_turn,
            tauri_controller::conversation::commands::update_conversation,
            tauri_controller::settings::load_provider_settings,
            tauri_controller::settings::load_settings,
            tauri_controller::settings::save_settings,
            tauri_controller::llm::list_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running KQode");
}
