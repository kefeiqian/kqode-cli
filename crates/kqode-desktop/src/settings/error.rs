use std::{error::Error, fmt, path::PathBuf};

use crate::secrets::KeychainError;

#[derive(Debug)]
pub enum SettingsError {
    Configuration(String),
    CredentialRollback {
        database: rusqlite::Error,
        keychain: KeychainError,
    },
    Database(rusqlite::Error),
    Json(serde_json::Error),
    Keychain(KeychainError),
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    Lock(String),
    SystemTime(std::time::SystemTimeError),
}

impl fmt::Display for SettingsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Configuration(message) => write!(formatter, "invalid settings: {message}"),
            Self::CredentialRollback { database, keychain } => write!(
                formatter,
                "settings database write failed ({database}) and credential rollback failed ({keychain})"
            ),
            Self::Database(error) => write!(formatter, "settings database error: {error}"),
            Self::Json(error) => write!(formatter, "model cache JSON error: {error}"),
            Self::Keychain(error) => write!(formatter, "settings credential error: {error}"),
            Self::Io { path, source } => {
                write!(
                    formatter,
                    "access database directory {}: {source}",
                    path.display()
                )
            }
            Self::Lock(message) => write!(formatter, "lock settings database: {message}"),
            Self::SystemTime(error) => write!(formatter, "read system time: {error}"),
        }
    }
}

impl Error for SettingsError {}

impl From<rusqlite::Error> for SettingsError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

impl From<serde_json::Error> for SettingsError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<KeychainError> for SettingsError {
    fn from(error: KeychainError) -> Self {
        Self::Keychain(error)
    }
}
