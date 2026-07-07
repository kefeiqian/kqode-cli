//! SQLite index store: bootstrap, pragmas, and a per-operation connection factory.
//!
//! The store is a rebuildable index over the JSONL transcript truth, so every
//! failure here is **non-fatal**: [`Store::open_or_bootstrap`] returns a typed
//! [`StoreError`] and the caller degrades to session-only rather than crashing,
//! and a DB that fails to open or migrate is **never auto-deleted** (a transient
//! lock or a WAL-on-network-FS failure can look like corruption).
//!
//! `rusqlite::Connection` is `Send` but `!Sync`, so callers open a fresh
//! connection per operation via [`Store::connect`] instead of sharing one
//! handle behind a mutex (WAL + `busy_timeout` make this cheap and safe).

mod migrations;
mod providers;
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;

pub use migrations::LATEST_USER_VERSION;
pub use providers::{ActiveSelection, ProviderSettings};

/// Modest busy-timeout: retry a locked write briefly, well under the TS client
/// request ceiling, then surface `SQLITE_BUSY` (bootstrap degrades, never crashes).
const BUSY_TIMEOUT_MS: u64 = 500;

/// How many times to retry the one-time WAL conversion when a concurrent
/// first-boot holds the brief exclusive lock (`busy_timeout` does not reliably
/// cover the journal-mode change). After this we surface the error and degrade.
const WAL_SET_MAX_RETRIES: u32 = 5;

/// Linear backoff base between WAL-conversion retries (attempt N waits N×this).
const WAL_SET_RETRY_MS: u64 = 20;

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
    /// A migration step failed; it was rolled back, leaving schema + version untouched.
    Migrate(rusqlite::Error),
    /// The on-disk `user_version` is newer than this binary knows; degrade to
    /// session-only with no reads or writes (forward-only, additive-only).
    NewerSchema { found: i64, known: i64 },
    /// The post-open/-migrate sanity read failed (corruption can surface here).
    Sanity(rusqlite::Error),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoPath => write!(f, "could not resolve the KQode database path"),
            Self::CreateDir(err) => write!(f, "could not create the database directory: {err}"),
            Self::Open(err) => write!(f, "could not open the database: {err}"),
            Self::Migrate(err) => write!(f, "could not migrate the database: {err}"),
            Self::NewerSchema { found, known } => write!(
                f,
                "database schema version {found} is newer than supported {known}; \
                 running session-only"
            ),
            Self::Sanity(err) => write!(f, "database sanity read failed: {err}"),
        }
    }
}

impl std::error::Error for StoreError {}

/// A handle to the migrated SQLite index.
///
/// Holds only the resolved path; callers open a fresh [`Connection`] per
/// operation. Cheap to clone and share across the sync request loop and the
/// deferred-response worker threads.
#[derive(Clone, Debug)]
pub struct Store {
    path: PathBuf,
}

impl Store {
    /// Opens (creating if absent) the DB at the resolved path, applies pragmas,
    /// migrates to [`LATEST_USER_VERSION`], and runs one sanity read.
    ///
    /// Intended to be called once at backend init (around `announce_ready`), off
    /// the request path.
    ///
    /// # Errors
    /// Returns a [`StoreError`] (never panics) when the path can't be resolved,
    /// the parent dir can't be created, the connection/pragmas fail, a migration
    /// fails (rolled back), the schema is newer than known, or the sanity read
    /// fails. Callers degrade to session-only on any error.
    pub fn open_or_bootstrap() -> Result<Self, StoreError> {
        let path = crate::paths::db_path().ok_or(StoreError::NoPath)?;
        Self::open_or_bootstrap_at(path)
    }

    /// [`Store::open_or_bootstrap`] against an explicit DB path (tests point this
    /// at a `tempfile` directory; accounts for the `-wal`/`-shm` sidecars).
    ///
    /// # Errors
    /// See [`Store::open_or_bootstrap`].
    pub fn open_or_bootstrap_at(path: PathBuf) -> Result<Self, StoreError> {
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            std::fs::create_dir_all(parent).map_err(StoreError::CreateDir)?;
            set_private_dir_permissions(parent);
        }
        let mut conn = open_connection(&path).map_err(StoreError::Open)?;
        ensure_wal(&conn).map_err(StoreError::Open)?;
        migrations::migrate(&mut conn)?;
        sanity_check(&conn)?;
        drop(conn);
        set_private_db_permissions(&path);
        Ok(Self { path })
    }

    /// Opens a fresh connection for a single operation, with WAL + `busy_timeout`
    /// applied so every connection behaves consistently.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] if the connection can't open.
    pub fn connect(&self) -> rusqlite::Result<Connection> {
        open_connection(&self.path)
    }

    /// The resolved on-disk path of the database file.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Opens a connection and applies the per-connection pragmas.
///
/// `busy_timeout` is installed first so writes wait briefly for a concurrent
/// holder instead of failing immediately; `synchronous=NORMAL` is the safe WAL
/// companion (only a power-loss can drop the last commit, and the index is
/// rebuildable). `journal_mode` is **not** set here — WAL is a persistent DB
/// property converted once at bootstrap (see [`ensure_wal`]) and inherited by
/// every later connection, which avoids a per-connection conversion race.
fn open_connection(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_millis(BUSY_TIMEOUT_MS))?;
    conn.execute_batch("PRAGMA synchronous=NORMAL;")?;
    Ok(conn)
}

/// Converts the DB to WAL once at bootstrap, retrying a transient `SQLITE_BUSY`
/// from a concurrent first-boot (the exclusive lock the rollback→WAL conversion
/// needs is brief and not reliably covered by `busy_timeout`). On an already-WAL
/// DB this is a lock-free no-op, so racing booters converge quickly.
fn ensure_wal(conn: &Connection) -> rusqlite::Result<()> {
    let mut attempt = 0;
    loop {
        match conn.execute_batch("PRAGMA journal_mode=WAL;") {
            Ok(()) => return Ok(()),
            Err(err) if attempt < WAL_SET_MAX_RETRIES && is_busy(&err) => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(u64::from(attempt) * WAL_SET_RETRY_MS));
            }
            Err(err) => return Err(err),
        }
    }
}

/// Whether an error is a transient busy/locked condition worth retrying.
fn is_busy(err: &rusqlite::Error) -> bool {
    matches!(
        err,
        rusqlite::Error::SqliteFailure(inner, _)
            if inner.code == rusqlite::ErrorCode::DatabaseBusy
                || inner.code == rusqlite::ErrorCode::DatabaseLocked
    )
}

/// One trivial read proving the DB is queryable after open + migrate;
/// corruption can surface here rather than at `open()`.
fn sanity_check(conn: &Connection) -> Result<(), StoreError> {
    conn.query_row("SELECT count(*) FROM active_selection", [], |row| {
        row.get::<_, i64>(0)
    })
    .map(|_| ())
    .map_err(StoreError::Sanity)
}

/// Best-effort `0700` on the KQode home dir (Unix). Windows inherits the
/// per-user profile ACL, so this is a no-op there.
#[cfg(unix)]
fn set_private_dir_permissions(dir: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn set_private_dir_permissions(_dir: &Path) {}

/// Best-effort `0600` on the DB file and its `-wal`/`-shm` sidecars (Unix).
#[cfg(unix)]
fn set_private_db_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    for suffix in ["", "-wal", "-shm"] {
        let mut os_path = path.as_os_str().to_owned();
        os_path.push(suffix);
        let _ = std::fs::set_permissions(
            PathBuf::from(os_path),
            std::fs::Permissions::from_mode(0o600),
        );
    }
}

#[cfg(not(unix))]
fn set_private_db_permissions(_path: &Path) {}
