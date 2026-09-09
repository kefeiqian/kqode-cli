use tauri::State;

use crate::{llm::LlmService, settings::Provider};
use kqode_provider::ProviderConnectionStatus;

#[tauri::command]
pub(crate) async fn list_models(
    provider: Provider,
    force_refresh: bool,
    llm_service: State<'_, LlmService>,
) -> Result<Vec<String>, String> {
    llm_service
        .list_models(provider, force_refresh)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn test_provider_connection(
    provider: Provider,
    llm_service: State<'_, LlmService>,
) -> Result<ProviderConnectionStatus, String> {
    llm_service
        .test_connection(provider)
        .await
        .map_err(|error| error.to_string())
}
