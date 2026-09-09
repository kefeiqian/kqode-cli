use tauri::State;

use crate::settings::{LlmSettings, Provider, SettingsService};

#[tauri::command]
pub(crate) fn load_provider_settings(
    provider: Provider,
    service: State<'_, SettingsService>,
) -> Result<LlmSettings, String> {
    service.load(provider).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn save_settings(
    settings: LlmSettings,
    service: State<'_, SettingsService>,
) -> Result<(), String> {
    service.save(&settings).map_err(|error| error.to_string())
}
