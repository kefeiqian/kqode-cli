use rusqlite::Connection;

use crate::{conversation::store, database::DatabaseError, settings};

pub(super) fn apply(connection: &Connection) -> Result<(), DatabaseError> {
    store::migrate_schema(connection)?;
    settings::migrate_schema(connection)?;
    Ok(())
}
