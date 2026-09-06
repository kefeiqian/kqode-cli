use rusqlite::Connection;

use crate::{conversation::store, database::DatabaseError};

pub(super) fn apply(connection: &Connection) -> Result<(), DatabaseError> {
    store::migrate_schema(connection)?;
    Ok(())
}
