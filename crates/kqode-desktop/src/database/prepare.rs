use std::{
    fs,
    path::{Path, PathBuf},
};

use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

use super::{
    DATABASE_FILENAME, DatabaseError, KQODE_DATA_DIRECTORY, migrations::migrate_connection,
};

/// Resolves the database path and applies migrations.
///
/// # Errors
///
/// Returns an error when an application path cannot be resolved or a schema
/// migration fails.
pub(crate) fn prepare<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, DatabaseError> {
    let database_path = app
        .path()
        .home_dir()?
        .join(KQODE_DATA_DIRECTORY)
        .join(DATABASE_FILENAME);
    migrate(&database_path)?;
    Ok(database_path)
}

fn migrate(path: &Path) -> Result<(), DatabaseError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| DatabaseError::Io {
            operation: "create database directory",
            path: parent.to_owned(),
            source,
        })?;
    }

    let mut connection = Connection::open(path)?;
    migrate_connection(&mut connection)
}
