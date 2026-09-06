use std::{error::Error, fmt, path::PathBuf};

#[derive(Debug)]
pub enum StoreError {
    Database(rusqlite::Error),
    InvalidProvider(String),
    InvalidRole(String),
    MissingConversation(String),
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    Time,
    TimestampOverflow,
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "conversation database error: {error}"),
            Self::InvalidProvider(provider) => {
                write!(
                    formatter,
                    "invalid stored conversation provider: {provider}"
                )
            }
            Self::InvalidRole(role) => write!(formatter, "invalid stored message role: {role}"),
            Self::MissingConversation(id) => {
                write!(formatter, "stored conversation {id} was not found")
            }
            Self::Io { path, source } => {
                write!(
                    formatter,
                    "access database directory {}: {source}",
                    path.display()
                )
            }
            Self::Time => formatter.write_str("system clock is before the Unix epoch"),
            Self::TimestampOverflow => {
                formatter.write_str("conversation update timestamp exceeds SQLite integer range")
            }
        }
    }
}

impl Error for StoreError {}

impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}
