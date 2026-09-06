mod v1;
mod v2;
mod v3;

use rusqlite::Connection;

use super::{DatabaseError, constants::LATEST_DATABASE_VERSION};

pub(crate) fn migrate_connection(connection: &mut Connection) -> Result<(), DatabaseError> {
    let mut version = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > LATEST_DATABASE_VERSION {
        return Err(DatabaseError::UnsupportedFutureVersion(version));
    }
    while version < LATEST_DATABASE_VERSION {
        let next_version = version + 1;
        let transaction = connection.transaction()?;
        match next_version {
            1 => v1::apply(&transaction)?,
            2 => v2::apply(&transaction)?,
            3 => v3::apply(&transaction)?,
            _ => unreachable!("all database migrations must be registered"),
        }
        transaction.pragma_update(None, "user_version", next_version)?;
        transaction.commit()?;
        version = next_version;
    }
    Ok(())
}
