use tauri::State;

use crate::{llm::LlmService, settings::LlmSettings};

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
