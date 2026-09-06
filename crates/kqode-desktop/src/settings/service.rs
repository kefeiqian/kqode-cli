use std::sync::{Arc, Mutex, MutexGuard};

use super::{LlmSettings, Provider, SettingsError, SettingsStore};

/// Application boundary for loading and saving provider settings.
#[derive(Clone)]
pub(crate) struct SettingsService {
    store: Arc<Mutex<SettingsStore>>,
}

impl SettingsService {
    pub(crate) fn new(store: Arc<Mutex<SettingsStore>>) -> Self {
        Self { store }
    }

    pub(crate) fn load(&self, provider: Provider) -> Result<LlmSettings, SettingsError> {
        self.lock()?.load_provider_settings(provider)
    }

    pub(crate) fn save(&self, settings: &LlmSettings) -> Result<(), SettingsError> {
        self.lock()?.save_settings(settings)
    }

    fn lock(&self) -> Result<MutexGuard<'_, SettingsStore>, SettingsError> {
        self.store
            .lock()
            .map_err(|error| SettingsError::Lock(error.to_string()))
    }
}
