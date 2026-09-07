use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, params};

use super::{LlmSettings, SettingsError, SettingsStore};

const MODEL_CACHE_TTL_SECONDS: i64 = 24 * 60 * 60;

impl SettingsStore {
    pub fn cached_models(
        &self,
        settings: &LlmSettings,
    ) -> Result<Option<Vec<String>>, SettingsError> {
        self.cached_models_at(&Self::cache_key(settings), unix_timestamp()?)
    }

    pub fn cache_models(
        &self,
        settings: &LlmSettings,
        models: &[String],
    ) -> Result<(), SettingsError> {
        self.cache_models_at(&Self::cache_key(settings), models, unix_timestamp()?)
    }

    pub(super) fn invalidate_model_cache(&self) -> Result<(), SettingsError> {
        self.connection.execute("DELETE FROM model_cache", [])?;
        Ok(())
    }

    pub(super) fn cached_models_at(
        &self,
        cache_key: &str,
        now: i64,
    ) -> Result<Option<Vec<String>>, SettingsError> {
        let cached = self
            .connection
            .query_row(
                "SELECT models_json, fetched_at FROM model_cache WHERE provider = ?1",
                [cache_key],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()?;

        let Some((models_json, fetched_at)) = cached else {
            return Ok(None);
        };
        if now.saturating_sub(fetched_at) >= MODEL_CACHE_TTL_SECONDS {
            return Ok(None);
        }

        Ok(Some(serde_json::from_str(&models_json)?))
    }

    pub(super) fn cache_models_at(
        &self,
        cache_key: &str,
        models: &[String],
        fetched_at: i64,
    ) -> Result<(), SettingsError> {
        self.connection.execute(
            "INSERT INTO model_cache (provider, models_json, fetched_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(provider) DO UPDATE SET
                models_json = excluded.models_json,
                fetched_at = excluded.fetched_at",
            params![cache_key, serde_json::to_string(models)?, fetched_at],
        )?;
        Ok(())
    }

    fn cache_key(settings: &LlmSettings) -> String {
        format!(
            "{}:{}",
            settings.provider.as_str(),
            settings.api_base_url.trim().trim_end_matches('/')
        )
    }
}

fn unix_timestamp() -> Result<i64, SettingsError> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(SettingsError::SystemTime)?
        .as_secs() as i64)
}
