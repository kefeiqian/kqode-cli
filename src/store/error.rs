/// A failure opening or migrating the store. Every variant is recoverable:
/// the caller degrades to session-only. The DB is never auto-deleted.
#[derive(Debug)]
pub enum StoreError {
    /// The DB path could not be resolved (no home dir).
    NoPath,
    /// The DB's parent directory could not be created.
    CreateDir(std::io::Error),
    /// Opening the connection or applying pragmas (e.g. a WAL-set failure) failed.
    Open(rusqlite::Error),
    /// Applying the embedded refinery migration chain failed.
    Migrate(refinery::Error),
    /// refinery detected applied migrations that are missing or divergent from
    /// the embedded migration chain.
    MigrationHistory(refinery::Error),
    /// refinery history rows are malformed and would make refinery panic while reading them.
    MigrationHistoryCorrupt(String),
    /// The post-open/-migrate sanity read failed (corruption can surface here).
    Sanity(rusqlite::Error),
    /// The post-migrate refinery history version does not match this binary.
    SchemaHistoryMismatch { found: Option<i64>, known: i64 },
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoPath => write!(f, "could not resolve the KQode database path"),
            Self::CreateDir(err) => write!(f, "could not create the database directory: {err}"),
            Self::Open(err) => write!(f, "could not open the database: {err}"),
            Self::Migrate(err) => write!(f, "could not migrate the database: {err}"),
            Self::MigrationHistory(err) => {
                write!(f, "database migration history is invalid: {err}")
            }
            Self::MigrationHistoryCorrupt(reason) => {
                write!(f, "database migration history is malformed: {reason}")
            }
            Self::Sanity(err) => write!(f, "database sanity read failed: {err}"),
            Self::SchemaHistoryMismatch { found, known } => write!(
                f,
                "database migration history is at version {found:?}; expected {known}"
            ),
        }
    }
}

impl std::error::Error for StoreError {}
