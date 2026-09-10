use std::{error::Error, fmt, path::PathBuf};

#[derive(Debug)]
pub enum StoreError {
    Database(rusqlite::Error),
    InvalidMessageStatus(String),
    InvalidProvider(String),
    InvalidRole(String),
    MissingConversation(String),
    MissingMessage(String),
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    PositionOverflow,
    Time,
    TimestampOverflow,
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "conversation database error: {error}"),
            Self::InvalidMessageStatus(status) => {
                write!(formatter, "invalid stored message status: {status}")
            }
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
            Self::MissingMessage(id) => write!(formatter, "stored message {id} was not found"),
            Self::Io { path, source } => {
                write!(
                    formatter,
                    "access database directory {}: {source}",
                    path.display()
                )
            }
            Self::PositionOverflow => {
                formatter.write_str("message position exceeds SQLite integer range")
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
