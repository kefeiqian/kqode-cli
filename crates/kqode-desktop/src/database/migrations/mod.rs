use rusqlite::Connection;

use super::DatabaseError;

mod embedded {
    use refinery::embed_migrations;

    embed_migrations!("src/database/migrations/sql");
}

/// Applies every pending embedded desktop database migration.
///
/// # Errors
///
/// Returns an error when migration history is missing or divergent, or when
/// SQLite cannot apply the pending migrations as one transaction.
pub(crate) fn migrate_connection(connection: &mut Connection) -> Result<(), DatabaseError> {
    embedded::migrations::runner()
        .set_grouped(true)
        .set_abort_divergent(true)
        .set_abort_missing(true)
        .run(connection)?;
    Ok(())
}
