use std::{error::Error, fmt, path::PathBuf};

#[derive(Debug)]
pub(crate) enum DatabaseError {
    Database(rusqlite::Error),
    Io {
        operation: &'static str,
        path: PathBuf,
        source: std::io::Error,
    },
    Migration(refinery::Error),
    Path(tauri::Error),
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "database migration error: {error}"),
            Self::Io {
                operation,
                path,
                source,
            } => write!(formatter, "{operation} {}: {source}", path.display()),
            Self::Migration(error) => write!(formatter, "database migration error: {error}"),
            Self::Path(error) => write!(formatter, "resolve database path: {error}"),
        }
    }
}

impl Error for DatabaseError {}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

impl From<refinery::Error> for DatabaseError {
    fn from(error: refinery::Error) -> Self {
        Self::Migration(error)
    }
}

impl From<tauri::Error> for DatabaseError {
    fn from(error: tauri::Error) -> Self {
        Self::Path(error)
    }
}
