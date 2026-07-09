//! Ordered, forward-only, additive-only schema migrations embedded with refinery.
//!
//! Each schema version lives in a `V{n}__*.sql` file under the crate-level
//! `migrations/` directory and is embedded into the binary at compile time.
//! Never edit or reorder a shipped migration: recovery from a bad migration is a
//! new forward-fix migration, not a down-migration (the DB is a rebuildable
//! index over the JSONL truth, per AGENTS.md).
//!
//! Migrations must stay fully transactional under refinery's grouped rusqlite
//! transaction: no `VACUUM`, journal-mode/foreign-key toggles, or other
//! implicit-commit statements. Pre-refinery `user_version = 1` databases are
//! intentionally refused with a reset instruction rather than auto-baselined.

use refinery::error::Kind;
use rusqlite::Connection;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use super::StoreError;

/// refinery's default schema-history table name.
pub(super) const REFINERY_SCHEMA_HISTORY_TABLE: &str = "refinery_schema_history";

mod embedded {
    use refinery::embed_migrations;

    embed_migrations!("migrations");
}

/// Reads the DB's `user_version` header value.
///
/// # Errors
/// Returns the underlying [`rusqlite::Error`] if the pragma read fails.
pub(super) fn user_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Latest embedded migration version this binary knows how to produce.
#[must_use]
pub(crate) fn latest_version() -> i64 {
    runner()
        .get_migrations()
        .iter()
        .map(|migration| migration.version() as i64)
        .max()
        .unwrap_or(0)
}

/// The pinned checksum for the shipped V1 migration.
#[cfg(test)]
pub(super) fn v1_checksum() -> u64 {
    runner()
        .get_migrations()
        .iter()
        .find(|migration| migration.version() == 1)
        .expect("V1 migration is embedded")
        .checksum()
}

/// The pinned checksum for the shipped V4 (theme preferences) migration.
#[cfg(test)]
pub(super) fn v4_checksum() -> u64 {
    runner()
        .get_migrations()
        .iter()
        .find(|migration| migration.version() == 4)
        .expect("V4 migration is embedded")
        .checksum()
}

/// Reads the max applied refinery migration version.
///
/// # Errors
/// Returns the underlying [`rusqlite::Error`] if the history read fails.
pub(super) fn applied_max_version(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    let sql = format!("SELECT MAX(version) FROM {REFINERY_SCHEMA_HISTORY_TABLE}");
    conn.query_row(&sql, [], |row| row.get(0))
}

/// Migrates `conn` forward to the latest embedded refinery migration.
///
/// # Errors
/// - [`StoreError::MigrationHistory`] if refinery detects missing or divergent
///   applied migrations via schema-history validation.
/// - [`StoreError::Migrate`] if refinery cannot assert history or apply the
///   embedded migration chain.
pub(super) fn migrate(conn: &mut Connection) -> Result<(), StoreError> {
    detect_pre_refinery_schema(conn)?;
    validate_history_rows(conn)?;
    runner().run(conn).map(|_| ()).map_err(map_refinery_error)
}

fn detect_pre_refinery_schema(conn: &Connection) -> Result<(), StoreError> {
    let user_version = user_version(conn).map_err(StoreError::Sanity)?;
    let table_count = app_table_count(conn).map_err(StoreError::Sanity)?;
    if user_version == 1 || table_count > 0 && !history_has_rows(conn)? {
        return Err(StoreError::LegacyReset {
            user_version,
            table_count,
        });
    }
    Ok(())
}

fn app_table_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('provider_settings', 'active_selection', 'sessions', 'turns', 'ui_preferences')",
        [],
        |row| row.get(0),
    )
}

fn history_has_rows(conn: &Connection) -> Result<bool, StoreError> {
    if !history_table_exists(conn).map_err(StoreError::Sanity)? {
        return Ok(false);
    }
    let sql = format!("SELECT EXISTS(SELECT 1 FROM {REFINERY_SCHEMA_HISTORY_TABLE})");
    conn.query_row(&sql, [], |row| row.get(0))
        .map_err(StoreError::Sanity)
}

fn validate_history_rows(conn: &Connection) -> Result<(), StoreError> {
    if !history_table_exists(conn).map_err(StoreError::Sanity)? {
        return Ok(());
    }

    let sql = format!(
        "SELECT version, applied_on, checksum FROM {REFINERY_SCHEMA_HISTORY_TABLE} ORDER BY version"
    );
    let mut stmt = conn.prepare(&sql).map_err(malformed_history)?;
    let mut rows = stmt.query([]).map_err(malformed_history)?;
    while let Some(row) = rows.next().map_err(malformed_history)? {
        let version = row.get::<_, i64>(0).map_err(malformed_history)?;
        let applied_on = row.get::<_, String>(1).map_err(malformed_history)?;
        OffsetDateTime::parse(&applied_on, &Rfc3339).map_err(|err| {
            StoreError::MigrationHistoryCorrupt(format!(
                "version {version} has invalid applied_on {applied_on:?}: {err}"
            ))
        })?;

        let checksum = row.get::<_, String>(2).map_err(malformed_history)?;
        checksum.parse::<u64>().map_err(|err| {
            StoreError::MigrationHistoryCorrupt(format!(
                "version {version} has invalid checksum {checksum:?}: {err}"
            ))
        })?;
    }
    Ok(())
}

fn history_table_exists(conn: &Connection) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
        )",
        [REFINERY_SCHEMA_HISTORY_TABLE],
        |row| row.get(0),
    )
}

fn malformed_history(err: rusqlite::Error) -> StoreError {
    StoreError::MigrationHistoryCorrupt(err.to_string())
}

fn runner() -> refinery::Runner {
    // refinery's rusqlite driver commits migration SQL and its history insert in
    // separate transactions when ungrouped. Grouping keeps the embedded chain
    // atomic while the migration set is still small.
    embedded::migrations::runner()
        .set_abort_missing(true)
        .set_abort_divergent(true)
        .set_grouped(true)
}

fn map_refinery_error(err: refinery::Error) -> StoreError {
    let is_history_mismatch = matches!(
        err.kind(),
        Kind::DivergentVersion(_, _) | Kind::MissingVersion(_)
    );
    if is_history_mismatch {
        StoreError::MigrationHistory(err)
    } else {
        StoreError::Migrate(err)
    }
}
