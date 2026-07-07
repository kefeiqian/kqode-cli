//! Ordered, forward-only, additive-only schema migrations embedded with refinery.
//!
//! Each schema version lives in a `V{n}__*.sql` file under the crate-level
//! `migrations/` directory and is embedded into the binary at compile time.
//! Never edit or reorder a shipped migration: recovery from a bad migration is a
//! new forward-fix migration, not a down-migration (the DB is a rebuildable
//! index over the JSONL truth, per AGENTS.md).

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
#[cfg(test)]
pub(super) fn user_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Latest embedded migration version this binary knows how to produce.
#[must_use]
pub(super) fn latest_version() -> i64 {
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
    validate_history_rows(conn)?;
    runner().run(conn).map(|_| ()).map_err(map_refinery_error)
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
