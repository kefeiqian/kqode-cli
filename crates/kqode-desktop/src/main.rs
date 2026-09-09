// Prevents an additional console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod conversation;
mod database;
mod inference;
mod llm;
mod secrets;
mod settings;
mod startup;
mod tauri_controller;
mod tools;

fn main() {
    startup::run_requested_diagnostic();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(startup::initialize_application)
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
            tauri_controller::settings::save_settings,
            tauri_controller::llm::list_models,
            tauri_controller::llm::test_provider_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running KQode");
}
