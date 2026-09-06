use rusqlite::Connection;

use super::SettingsError;

const SETTINGS_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS llm_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL,
        api_base_url TEXT NOT NULL DEFAULT '',
        api_key TEXT NOT NULL,
        model TEXT
    );
    CREATE TABLE IF NOT EXISTS provider_settings (
        provider TEXT PRIMARY KEY,
        api_base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        highlighted_models_json TEXT NOT NULL DEFAULT '[]',
        model TEXT NOT NULL
    );
";

pub(super) fn initialize(connection: &Connection) -> Result<(), SettingsError> {
    connection.execute_batch(SETTINGS_SCHEMA)?;
    ensure_api_base_url_column(connection)?;
    ensure_highlighted_models_column(connection)?;
    connection.execute_batch(
        "INSERT OR IGNORE INTO provider_settings (
            provider, api_base_url, api_key, highlighted_models_json, model
         )
         SELECT provider, api_base_url, api_key, '[]', COALESCE(model, '')
         FROM llm_settings
         WHERE id = 1;",
    )?;
    Ok(())
}

fn ensure_highlighted_models_column(connection: &Connection) -> Result<(), SettingsError> {
    let mut statement = connection.prepare("PRAGMA table_info(provider_settings)")?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns
        .iter()
        .any(|column| column == "highlighted_models_json")
    {
        connection.execute(
            "ALTER TABLE provider_settings
             ADD COLUMN highlighted_models_json TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }
    Ok(())
}

fn ensure_api_base_url_column(connection: &Connection) -> Result<(), SettingsError> {
    let mut statement = connection.prepare("PRAGMA table_info(llm_settings)")?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|column| column == "api_base_url") {
        connection.execute(
            "ALTER TABLE llm_settings
             ADD COLUMN api_base_url TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    Ok(())
}
