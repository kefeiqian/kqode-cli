use std::{error::Error, fmt, path::PathBuf};

use crate::{conversation::store, settings};

use super::constants::LATEST_DATABASE_VERSION;

#[derive(Debug)]
pub(crate) enum DatabaseError {
    Conversation(store::StoreError),
    Database(rusqlite::Error),
    Io {
        operation: &'static str,
        path: PathBuf,
        source: std::io::Error,
    },
    Path(tauri::Error),
    Settings(settings::SettingsError),
    UnsupportedFutureVersion(u32),
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Conversation(error) => error.fmt(formatter),
            Self::Database(error) => write!(formatter, "database migration error: {error}"),
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} {}: {source}", path.display()),
            Self::Path(error) => write!(formatter, "resolve database path: {error}"),
            Self::Settings(error) => error.fmt(formatter),
            Self::UnsupportedFutureVersion(version) => write!(
                formatter,
                "database version {version} is newer than supported version \
                 {LATEST_DATABASE_VERSION}"
            ),
        }
    }
}

impl Error for DatabaseError {}

impl From<store::StoreError> for DatabaseError {
    fn from(error: store::StoreError) -> Self {
        Self::Conversation(error)
    }
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

impl From<settings::SettingsError> for DatabaseError {
    fn from(error: settings::SettingsError) -> Self {
        Self::Settings(error)
    }
}

impl From<tauri::Error> for DatabaseError {
    fn from(error: tauri::Error) -> Self {
        Self::Path(error)
    }
}
