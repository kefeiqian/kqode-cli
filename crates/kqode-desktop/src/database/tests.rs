use rusqlite::Connection;

use super::migrate_connection;

#[test]
fn migrates_a_new_database_to_the_refinery_baseline() {
    let mut connection = Connection::open_in_memory().unwrap();

    migrate_connection(&mut connection).unwrap();

    assert_eq!(applied_version(&connection), 1);
    assert_eq!(user_version(&connection), 0);
    for table in [
        "conversations",
        "messages",
        "pending_turns",
        "provider_settings",
        "model_cache",
    ] {
        assert!(table_exists(&connection, table), "expected table {table}");
    }
    assert!(!column_exists(&connection, "provider_settings", "api_key"));
}

#[test]
fn refinery_migrations_are_idempotent() {
    let mut connection = Connection::open_in_memory().unwrap();

    migrate_connection(&mut connection).unwrap();
    migrate_connection(&mut connection).unwrap();

    assert_eq!(applied_version(&connection), 1);
}

#[test]
fn v1_migration_checksum_is_pinned() {
    let mut connection = Connection::open_in_memory().unwrap();
    migrate_connection(&mut connection).unwrap();

    let checksum: String = connection
        .query_row(
            "SELECT checksum FROM refinery_schema_history WHERE version = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(checksum, "980297202996443176");
}

#[test]
fn does_not_adopt_an_unmanaged_schema() {
    let mut connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .unwrap();

    assert!(migrate_connection(&mut connection).is_err());
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM refinery_schema_history", [], |row| {
                row.get::<_, u32>(0)
            })
            .unwrap(),
        0
    );
    assert!(table_exists(&connection, "conversations"));
    assert!(!table_exists(&connection, "messages"));
}

fn applied_version(connection: &Connection) -> i32 {
    connection
        .query_row(
            "SELECT MAX(version) FROM refinery_schema_history",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

fn user_version(connection: &Connection) -> u32 {
    connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
}

fn table_exists(connection: &Connection, table: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
             )",
            [table],
            |row| row.get(0),
        )
        .unwrap()
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2
             )",
            [table, column],
            |row| row.get(0),
        )
        .unwrap()
}
