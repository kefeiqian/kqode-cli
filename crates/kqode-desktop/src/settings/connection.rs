use std::{fs, path::Path};

use rusqlite::Connection;

use crate::secrets::SecretsStore;

use super::SettingsError;
#[cfg(test)]
use super::migration::{migrate_credentials, migrate_schema};

pub struct SettingsStore {
    pub(super) connection: Connection,
    pub(super) secrets: SecretsStore,
}

impl SettingsStore {
    /// Opens a prepared settings database.
    ///
    /// # Errors
    ///
    /// Returns an error when the database directory cannot be created or SQLite
    /// cannot open the database.
    pub fn open(path: &Path) -> Result<Self, SettingsError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| SettingsError::Io {
                path: parent.to_owned(),
                source,
            })?;
        }

        Ok(Self {
            connection: Connection::open(path)?,
            secrets: SecretsStore::default(),
        })
    }

    #[cfg(test)]
    pub(crate) fn initialize(connection: Connection) -> Result<Self, SettingsError> {
        migrate_schema(&connection)?;
        migrate_credentials(&connection)?;
        Ok(Self {
            connection,
            secrets: SecretsStore::default(),
        })
    }
}
