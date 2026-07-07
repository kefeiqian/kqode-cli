use std::path::{Path, PathBuf};

/// Stable prefix for backend stderr/TUI attribution of fatal store failures.
pub const STORE_FATAL_SENTINEL: &str = "KQODE_STORE_FATAL:";

/// A failure opening or migrating the store. The DB is never auto-deleted.
#[derive(Debug)]
pub enum StoreError {
    /// The DB path could not be resolved (no home dir).
    NoPath,
    /// A path-qualified store failure ready for user-facing display.
    WithPath {
        /// The database file path the backend tried to open.
        path: PathBuf,
        /// The underlying failure.
        source: Box<StoreError>,
    },
    /// The DB's parent directory could not be created.
    CreateDir(std::io::Error),
    /// Opening the connection or applying pragmas (e.g. a WAL-set failure) failed.
    Open(rusqlite::Error),
    /// A pre-refinery or partial schema exists without usable refinery history.
    LegacyReset { user_version: i64, table_count: i64 },
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
            Self::WithPath { path, source } => write!(
                f,
                "{STORE_FATAL_SENTINEL} KQode database `{}` cannot be used: {} {}",
                path.display(),
                source.summary(),
                source.remedy(path)
            ),
            Self::CreateDir(err) => write!(f, "could not create the database directory: {err}"),
            Self::Open(err) => write!(f, "could not open the database: {err}"),
            Self::LegacyReset {
                user_version,
                table_count,
            } => write!(
                f,
                "pre-refinery schema detected (user_version {user_version}, {table_count} app tables)"
            ),
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

impl StoreError {
    /// Adds the resolved database path to this error for actionable display.
    #[must_use]
    pub fn with_path(self, path: PathBuf) -> Self {
        match self {
            Self::NoPath | Self::WithPath { .. } => self,
            source => Self::WithPath {
                path,
                source: Box::new(source),
            },
        }
    }

    /// Returns the underlying non-wrapper error.
    #[must_use]
    pub fn root_cause(&self) -> &StoreError {
        match self {
            Self::WithPath { source, .. } => source.root_cause(),
            err => err,
        }
    }

    fn summary(&self) -> String {
        match self.root_cause() {
            Self::NoPath => "the database path could not be resolved.".to_owned(),
            Self::WithPath { .. } => unreachable!("root_cause removes path wrappers"),
            Self::CreateDir(err) => format!("the database directory could not be created: {err}."),
            Self::Open(err) => format!("the database could not be opened: {err}."),
            Self::LegacyReset {
                user_version,
                table_count,
            } => format!(
                "a pre-refinery or partial schema was found (user_version {user_version}, {table_count} app tables, no migration history)."
            ),
            Self::Migrate(err) => format!("migration failed: {err}."),
            Self::MigrationHistory(err) => format!("migration history is incompatible: {err}."),
            Self::MigrationHistoryCorrupt(reason) => {
                format!("migration history is malformed: {reason}.")
            }
            Self::Sanity(err) => format!("the post-migration sanity check failed: {err}."),
            Self::SchemaHistoryMismatch { found, known } => {
                format!("migration history is at version {found:?}; expected {known}.")
            }
        }
    }

    fn remedy(&self, path: &Path) -> String {
        match self.root_cause() {
            Self::NoPath => "Set a valid home directory and restart KQode.".to_owned(),
            Self::WithPath { .. } => unreachable!("root_cause removes path wrappers"),
            Self::CreateDir(_) | Self::Open(_) => {
                "Fix filesystem permissions or move the KQode home directory, then restart."
                    .to_owned()
            }
            Self::MigrationHistory(err) if is_upgrade_only_history_error(err) => {
                "Upgrade to a KQode binary that knows this database migration history.".to_owned()
            }
            Self::LegacyReset { .. }
            | Self::Migrate(_)
            | Self::MigrationHistory(_)
            | Self::MigrationHistoryCorrupt(_)
            | Self::Sanity(_)
            | Self::SchemaHistoryMismatch { .. } => reset_remedy(path),
        }
    }
}

impl std::error::Error for StoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::NoPath
            | Self::LegacyReset { .. }
            | Self::MigrationHistoryCorrupt(_)
            | Self::SchemaHistoryMismatch { .. } => None,
            Self::WithPath { source, .. } => Some(source),
            Self::CreateDir(err) => Some(err),
            Self::Open(err) | Self::Sanity(err) => Some(err),
            Self::Migrate(err) | Self::MigrationHistory(err) => Some(err),
        }
    }
}

fn is_upgrade_only_history_error(err: &refinery::Error) -> bool {
    match err.kind() {
        refinery::error::Kind::DivergentVersion(_, _) => true,
        refinery::error::Kind::MissingVersion(migration) => {
            i64::from(migration.version()) > super::migrations::latest_version()
        }
        _ => false,
    }
}

fn reset_remedy(path: &Path) -> String {
    let wal = sidecar_path(path, "-wal");
    let shm = sidecar_path(path, "-shm");
    format!(
        "After KQode exits, delete `{}`, `{}`, and `{}`, then restart; the index rebuilds from JSONL.",
        path.display(),
        wal.display(),
        shm.display()
    )
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut os_path = path.as_os_str().to_owned();
    os_path.push(suffix);
    PathBuf::from(os_path)
}
