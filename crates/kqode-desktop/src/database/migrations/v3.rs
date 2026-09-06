use rusqlite::Connection;

use crate::{database::DatabaseError, settings};

pub(super) fn apply(connection: &Connection) -> Result<(), DatabaseError> {
    settings::migrate_credentials(connection)?;
    Ok(())
}
