//! SQLite index store: bootstrap, pragmas, and a per-operation connection factory.
//!
//! The store is a rebuildable index over the JSONL transcript truth. A DB that
//! fails to open, lock, migrate, or pass sanity checks is **fatal at backend
//! startup** and is **never auto-deleted**. Recovery is an explicit reset of the
//! DB file and its WAL/SHM sidecars, after which the index rebuilds from JSONL.
//!
//! Schema versioning is owned by compile-time-embedded `refinery` migrations and
//! `refinery_schema_history`; SQLite `PRAGMA user_version` remains `0` except
//! when detecting legacy pre-refinery databases that need a one-time reset.
//!
//! `rusqlite::Connection` is `Send` but `!Sync`, so callers open a fresh
//! connection per operation via [`Store::connect`] instead of sharing one
//! handle behind a mutex (WAL + `busy_timeout` make this cheap and safe).
//!
//! ## Multiple instances
//!
//! Several `kqode` processes for one OS user share this single user-global DB
//! and may read and write it concurrently. WAL admits many concurrent readers
//! plus one writer; `busy_timeout` makes a contended writer wait (up to a few
//! seconds at runtime) rather than fail; and the advisory bootstrap `lock`
//! (`<db>.lock`) serializes only the migrate phase so racing first-boots
//! converge instead of colliding. This
//! assumes a **local filesystem** — WAL's `-wal`/`-shm` sidecars and shared
//! memory are unreliable over network mounts (NFS/SMB). Writes are small and
//! infrequent and the DB is a rebuildable index over JSONL, so worst-case
//! contention or a lost write stays recoverable.

mod error;
mod lock;
mod memory;
mod migrations;
mod providers;
mod recovery;
mod sessions;
#[cfg(test)]
mod tests;
mod theme;

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;

pub use error::{STORE_FATAL_SENTINEL, StoreError};
pub use memory::{StoredInboxEntry, StoredMemoryItem};
pub use providers::{ActiveSelection, ProviderSettings};
pub use sessions::StoredSession;
pub use theme::{MAX_THEME_ID_LEN, is_valid_theme_id};

/// Bootstrap busy-timeout: at startup wait only briefly for a locked DB, then
/// fail fast with a store-fatal error instead of hanging the backend spawn.
const BOOTSTRAP_BUSY_TIMEOUT_MS: u64 = 500;

/// Runtime busy-timeout: per-operation connections wait up to this long for a
/// concurrent writer (WAL has a single write slot) before returning
/// `SQLITE_BUSY` to the caller. Generous on purpose — these writes are tiny and
/// infrequent, contention is transient (another instance mid-write, a WAL
/// checkpoint, or Windows AV/search-indexer briefly locking the `-wal`/`-shm`
/// sidecars), and a spuriously failed user operation is worse than a short wait.
/// This is a ceiling, not a cost: with no contention a write takes the lock
/// immediately regardless of the value.
const RUNTIME_BUSY_TIMEOUT_MS: u64 = 5_000;

/// WAL conversion retries for a concurrent first-boot's brief exclusive lock.
const WAL_SET_MAX_RETRIES: u32 = 5;

/// Linear backoff base between WAL-conversion retries (attempt N waits N×this).
const WAL_SET_RETRY_MS: u64 = 20;

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
    /// Opens the DB, applies pragmas, runs migrations, and sanity-checks it.
    ///
    /// Intended to be called once at backend init (around `announce_ready`), off
    /// the request path.
    ///
    /// # Errors
    /// Returns a [`StoreError`] when path resolution, directory creation,
    /// pragmas, migration, schema-history validation, or sanity reads fail.
    pub fn open_or_bootstrap() -> Result<Self, StoreError> {
        let path = crate::paths::db_path().ok_or(StoreError::NoPath)?;
        Self::open_or_bootstrap_at(path)
    }

    /// [`Store::open_or_bootstrap`] against an explicit DB path.
    ///
    /// # Errors
    /// See [`Store::open_or_bootstrap`].
    pub fn open_or_bootstrap_at(path: PathBuf) -> Result<Self, StoreError> {
        let result = (|| {
            let db_existed = path.exists();
            if let Some(parent) = path
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
            {
                std::fs::create_dir_all(parent).map_err(StoreError::CreateDir)?;
                set_private_dir_permissions(parent);
            }
            let _lock = lock::acquire(&path)?;
            let mut conn =
                open_connection(&path, BOOTSTRAP_BUSY_TIMEOUT_MS).map_err(StoreError::Open)?;
            ensure_wal(&conn).map_err(StoreError::Open)?;
            let migrations_applied = migrations::migrate(&mut conn)?;
            sanity_check(&conn)?;
            drop(conn);
            set_private_db_permissions(&path);
            let store = Self { path: path.clone() };
            if !db_existed || migrations_applied {
                store.reindex_from_file_truth()?;
            }
            Ok::<Self, StoreError>(store)
        })();
        result.map_err(|err| err.with_path(path))
    }

    /// Opens a fresh connection for a single runtime operation, with WAL and the
    /// generous [`RUNTIME_BUSY_TIMEOUT_MS`] applied so a concurrent writer is
    /// waited out rather than failing the operation.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] if the connection can't open.
    pub fn connect(&self) -> rusqlite::Result<Connection> {
        open_connection(&self.path, RUNTIME_BUSY_TIMEOUT_MS)
    }

    /// The resolved on-disk path of the database file.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    fn reindex_from_file_truth(&self) -> Result<(), StoreError> {
        self.reindex_sessions_from_logs()
            .map_err(StoreError::Sanity)?;
        self.reindex_memory_from_files().map_err(StoreError::Sanity)
    }
}

/// Opens a connection and applies the per-connection pragmas.
///
/// `busy_timeout` (`busy_timeout_ms`) is installed first so a write waits for a
/// concurrent holder instead of failing immediately — bootstrap passes a short
/// fail-fast value, runtime operations a generous one; `synchronous=NORMAL` is
/// the safe WAL companion (only a power-loss can drop the last commit, and the
/// index is rebuildable). `journal_mode` is **not** set here — WAL is a
/// persistent DB property converted once at bootstrap (see [`ensure_wal`]) and
/// inherited by every later connection, which avoids a per-connection
/// conversion race.
fn open_connection(path: &Path, busy_timeout_ms: u64) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_millis(busy_timeout_ms))?;
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

/// One trivial read proving the DB is queryable after open + migrate, plus a
/// refinery history check proving the embedded latest version was applied.
fn sanity_check(conn: &Connection) -> Result<(), StoreError> {
    let mut attempt = 0;
    loop {
        match run_sanity_check(conn) {
            Ok(found) if found == Some(migrations::latest_version()) => return Ok(()),
            Ok(found) => {
                return Err(StoreError::SchemaHistoryMismatch {
                    found,
                    known: migrations::latest_version(),
                });
            }
            Err(err) if attempt < WAL_SET_MAX_RETRIES && is_busy(&err) => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(u64::from(attempt) * WAL_SET_RETRY_MS));
            }
            Err(err) => return Err(StoreError::Sanity(err)),
        }
    }
}

fn run_sanity_check(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    conn.query_row("SELECT count(*) FROM active_selection", [], |row| {
        row.get::<_, i64>(0)
    })?;
    migrations::applied_max_version(conn)
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
        let _ = std::fs::set_permissions(
            recovery::sidecar_path(path, suffix),
            std::fs::Permissions::from_mode(0o600),
        );
    }
}

#[cfg(not(unix))]
fn set_private_db_permissions(_path: &Path) {}
