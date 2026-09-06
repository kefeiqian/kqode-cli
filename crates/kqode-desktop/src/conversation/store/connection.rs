use std::{fs, path::Path};

use rusqlite::Connection;

use super::StoreError;
#[cfg(test)]
use super::schema;

pub struct ConversationStore {
    pub(super) connection: Connection,
}

impl ConversationStore {
    /// Opens a prepared conversation database.
    ///
    /// # Errors
    ///
    /// Returns an error when the database directory cannot be created, SQLite
    /// cannot open the database, or foreign-key enforcement cannot be enabled.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| StoreError::Io {
                path: parent.to_owned(),
                source,
            })?;
        }

        let connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", true)?;
        Ok(Self { connection })
    }

    #[cfg(test)]
    pub(crate) fn initialize(connection: Connection) -> Result<Self, StoreError> {
        schema::migrate(&connection)?;
        Ok(Self { connection })
    }
}
