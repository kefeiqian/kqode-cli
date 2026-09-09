use rusqlite::{OptionalExtension, params};

use crate::secrets::{ApiKey, KeychainError};

use super::{
    LlmSettings, Provider, SettingsError, SettingsStore, credentials::api_key_preview,
    credentials::resolve_submitted_api_key,
};

impl SettingsStore {
    pub fn load_provider_settings(&self, provider: Provider) -> Result<LlmSettings, SettingsError> {
        let stored = self
            .connection
            .query_row(
                "SELECT api_base_url, key_present, highlighted_models_json, model
                 FROM provider_settings
                 WHERE provider = ?1",
                [provider.as_str()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?;

        let Some((api_base_url, key_present, highlighted_models_json, model)) = stored else {
            return Ok(LlmSettings::for_provider(provider));
        };
        let api_key = if key_present {
            self.secrets
                .get_key(provider)?
                .map(|key| key.expose().to_owned())
                .unwrap_or_default()
        } else {
            String::new()
        };

        let model = if provider.requires_api_key() && api_key.is_empty() {
            String::new()
        } else {
            model
        };
        Ok(LlmSettings {
            provider,
            api_base_url: if api_base_url.trim().is_empty() {
                provider.default_api_base_url().to_owned()
            } else {
                api_base_url
            },
            api_key_preview: api_key_preview(&api_key),
            api_key,
            highlighted_models: serde_json::from_str(&highlighted_models_json)?,
            model,
        })
    }

    pub fn save_settings(&self, settings: &LlmSettings) -> Result<(), SettingsError> {
        let api_base_url = normalized_api_base_url(settings)?;
        let current = self.load_provider_settings(settings.provider)?;
        let api_key = resolve_submitted_api_key(settings, &current.api_base_url, &current.api_key);
        let old_api_key = current.api_key;
        let credentials_changed = current.api_base_url.trim().trim_end_matches('/') != api_base_url
            || old_api_key != api_key;
        let model = if settings.provider.requires_api_key() && api_key.is_empty() {
            ""
        } else {
            settings.model.trim()
        };

        write_keychain(&self.secrets, settings.provider, &api_key)?;
        let result = self.connection.execute(
            "INSERT INTO provider_settings (
                provider,
                api_base_url,
                key_present,
                highlighted_models_json,
                model
             )
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(provider) DO UPDATE SET
                api_base_url = excluded.api_base_url,
                key_present = excluded.key_present,
                highlighted_models_json = excluded.highlighted_models_json,
                model = excluded.model",
            params![
                settings.provider.as_str(),
                api_base_url,
                !api_key.is_empty(),
                serde_json::to_string(&settings.highlighted_models)?,
                model,
            ],
        );
        if let Err(error) = result {
            if let Err(keychain) = write_keychain(&self.secrets, settings.provider, &old_api_key) {
                return Err(SettingsError::CredentialRollback {
                    database: error,
                    keychain,
                });
            }
            return Err(error.into());
        }

        if credentials_changed {
            self.invalidate_model_cache()?;
        }
        Ok(())
    }
}

fn normalized_api_base_url(settings: &LlmSettings) -> Result<String, SettingsError> {
    if settings.provider == Provider::Custom {
        return kqode_provider::validate_base_url(&settings.api_base_url)
            .map_err(|error| SettingsError::Configuration(error.to_string()));
    }
    Ok(settings
        .api_base_url
        .trim()
        .trim_end_matches('/')
        .to_owned())
}

fn write_keychain(
    secrets: &crate::secrets::SecretsStore,
    provider: Provider,
    api_key: &str,
) -> Result<(), KeychainError> {
    if api_key.is_empty() {
        secrets.clear_key(provider)?;
    } else {
        secrets.set_key(provider, &ApiKey::new(api_key.to_owned()))?;
    }
    Ok(())
}
