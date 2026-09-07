use tauri::State;

use crate::{llm::LlmService, settings::LlmSettings};
use kqode_provider::ProviderConnectionStatus;

#[tauri::command]
pub(crate) async fn list_models(
    settings: LlmSettings,
    force_refresh: bool,
    llm_service: State<'_, LlmService>,
) -> Result<Vec<String>, String> {
    llm_service
        .list_models(settings, force_refresh)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn test_provider_connection(
    settings: LlmSettings,
    llm_service: State<'_, LlmService>,
) -> Result<ProviderConnectionStatus, String> {
    llm_service
        .test_connection(settings)
        .await
        .map_err(|error| error.to_string())
}
