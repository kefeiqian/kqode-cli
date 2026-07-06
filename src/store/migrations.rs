//! Ordered, forward-only, additive-only schema migrations.
//!
//! Each step and its `user_version` bump run inside one `BEGIN IMMEDIATE …
//! COMMIT`, so a failing step rolls back leaving the schema and version
//! untouched. The runner uses double-checked locking: it reads `user_version`
//! cheaply first and, if behind, re-reads it *inside* the write transaction
//! before applying — a concurrent instance may have migrated while we waited on
//! the lock, which serializes concurrent first-boot across workspaces.
//!
//! Never edit or reorder a shipped step: recovery from a bad migration is a new
//! forward-fix step, not a down-migration (the DB is a rebuildable index over
//! the JSONL truth, per AGENTS.md).

use rusqlite::{Connection, TransactionBehavior};

use super::StoreError;

/// Latest schema version this binary knows how to produce.
pub const LATEST_USER_VERSION: i64 = 1;

/// One forward-only migration step: apply `sql`, then stamp `version`.
struct Step {
    version: i64,
    sql: &'static str,
}

/// Ordered migration steps. Append only — never edit or reorder a shipped step.
const STEPS: &[Step] = &[Step {
    version: 1,
    sql: STEP_1_INITIAL_SCHEMA,
}];

/// Step 1: provider settings + the single active selection, plus the
/// **provisional** `sessions`/`turns` spine (reshaped by the session
/// milestone; permissive, no hard FKs, rebuildable from JSONL). No key
/// material is ever stored — `provider_settings` holds only a non-secret
/// `key_present` bit.
const STEP_1_INITIAL_SCHEMA: &str = "\
CREATE TABLE provider_settings (
    provider_id       TEXT PRIMARY KEY NOT NULL,
    base_url          TEXT NOT NULL,
    label             TEXT,
    key_present       INTEGER NOT NULL DEFAULT 0,
    last_connected_at INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);
CREATE TABLE active_selection (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    provider_id TEXT NOT NULL,
    model_id    TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE TABLE sessions (
    id            TEXT PRIMARY KEY NOT NULL,
    created_at    INTEGER NOT NULL,
    workspace_cwd TEXT NOT NULL,
    jsonl_path    TEXT NOT NULL
);
CREATE TABLE turns (
    id         TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);";

/// Reads the DB's `user_version` header value.
///
/// # Errors
/// Returns the underlying [`rusqlite::Error`] if the pragma read fails.
pub(super) fn user_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Migrates `conn` forward to [`LATEST_USER_VERSION`].
///
/// # Errors
/// - [`StoreError::NewerSchema`] if the DB is at a version newer than known
///   (caller degrades to session-only; the DB is never modified or deleted).
/// - [`StoreError::Migrate`] if reading the version or applying a step fails
///   (the step's transaction rolls back, leaving schema + version untouched).
pub(super) fn migrate(conn: &mut Connection) -> Result<(), StoreError> {
    let current = user_version(conn).map_err(StoreError::Migrate)?;
    if current > LATEST_USER_VERSION {
        return Err(StoreError::NewerSchema {
            found: current,
            known: LATEST_USER_VERSION,
        });
    }
    for step in STEPS {
        apply_step(conn, step.version, step.sql)?;
    }
    Ok(())
}

/// Applies one step transactionally with double-checked locking.
///
/// `BEGIN IMMEDIATE` takes the write lock up front (serializing concurrent
/// boots); the version is re-read inside the lock so a step already applied by
/// a racing instance is skipped without a duplicate `CREATE TABLE`.
///
/// # Errors
/// Returns [`StoreError::Migrate`] if the transaction, the batch, the version
/// bump, or the commit fails; the transaction is rolled back on drop so no
/// partial schema survives.
pub(super) fn apply_step(conn: &mut Connection, version: i64, sql: &str) -> Result<(), StoreError> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(StoreError::Migrate)?;
    if user_version(&tx).map_err(StoreError::Migrate)? >= version {
        // Already applied (by us on a prior loop, or a concurrent instance).
        tx.commit().map_err(StoreError::Migrate)?;
        return Ok(());
    }
    tx.execute_batch(sql).map_err(StoreError::Migrate)?;
    // `user_version` cannot be bound as a parameter; `version` is our constant.
    tx.pragma_update(None, "user_version", version)
        .map_err(StoreError::Migrate)?;
    tx.commit().map_err(StoreError::Migrate)
}
