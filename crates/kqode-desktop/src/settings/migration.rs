use rusqlite::Connection;

use crate::secrets::{ApiKey, SecretsStore};

use super::{Provider, SettingsError, cache, schema};

pub(crate) fn migrate_schema(connection: &Connection) -> Result<(), SettingsError> {
    schema::initialize(connection)?;
    cache::initialize(connection)
}

pub(crate) fn migrate_credentials(connection: &Connection) -> Result<(), SettingsError> {
    if !has_column(connection, "provider_settings", "api_key")? {
        connection.execute("DROP TABLE IF EXISTS llm_settings", [])?;
        return Ok(());
    }

    let credentials = {
        let mut statement = connection.prepare(
            "SELECT provider, api_key
             FROM provider_settings
             WHERE TRIM(api_key) <> ''",
        )?;
        statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };
    let secrets = SecretsStore::default();
    for (provider, api_key) in credentials {
        let provider = Provider::parse(&provider).map_err(|provider| {
            SettingsError::Configuration(format!(
                "cannot migrate credential for unknown provider {provider}"
            ))
        })?;
        secrets.set_key(provider, &ApiKey::new(api_key))?;
    }

    connection.execute_batch(
        "CREATE TABLE provider_settings_v3 (
            provider TEXT PRIMARY KEY,
            api_base_url TEXT NOT NULL,
            key_present INTEGER NOT NULL DEFAULT 0,
            highlighted_models_json TEXT NOT NULL DEFAULT '[]',
            model TEXT NOT NULL
        );
        INSERT INTO provider_settings_v3 (
            provider,
            api_base_url,
            key_present,
            highlighted_models_json,
            model
        )
        SELECT
            provider,
            api_base_url,
            CASE WHEN TRIM(api_key) = '' THEN 0 ELSE 1 END,
            highlighted_models_json,
            model
        FROM provider_settings;
        DROP TABLE provider_settings;
        ALTER TABLE provider_settings_v3 RENAME TO provider_settings;
        DROP TABLE IF EXISTS llm_settings;",
    )?;
    Ok(())
}

fn has_column(
    connection: &Connection,
    table: &str,
    expected_column: &str,
) -> Result<bool, SettingsError> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(columns.iter().any(|column| column == expected_column))
}
