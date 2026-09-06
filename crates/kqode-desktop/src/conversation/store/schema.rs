use rusqlite::Connection;

use super::StoreError;

const DATABASE_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        workspace_path TEXT,
        provider TEXT,
        model TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'error')),
        content TEXT NOT NULL,
        model TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        UNIQUE (conversation_id, position)
    );

    CREATE TABLE IF NOT EXISTS pending_turns (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        content TEXT NOT NULL,
        retry_error_id TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        UNIQUE (conversation_id, position)
    );
";

pub(crate) fn migrate(connection: &Connection) -> Result<(), StoreError> {
    connection.execute_batch(DATABASE_SCHEMA)?;
    for (column, definition) in [
        ("workspace_path", "workspace_path TEXT"),
        ("provider", "provider TEXT"),
        ("model", "model TEXT"),
        ("archived", "archived INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !has_conversation_column(connection, column)? {
            connection.execute(
                &format!("ALTER TABLE conversations ADD COLUMN {definition}"),
                [],
            )?;
        }
    }
    Ok(())
}

fn has_conversation_column(connection: &Connection, column_name: &str) -> Result<bool, StoreError> {
    let mut statement = connection.prepare("PRAGMA table_info(conversations)")?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for column in columns {
        if column? == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}
