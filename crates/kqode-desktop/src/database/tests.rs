use rusqlite::Connection;

use super::{
    constants::LATEST_DATABASE_VERSION, error::DatabaseError, migrations::migrate_connection,
};

#[test]
fn migrates_a_new_database_to_the_latest_version() {
    let mut connection = Connection::open_in_memory().unwrap();

    migrate_connection(&mut connection).unwrap();

    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_DATABASE_VERSION);
    for table in [
        "conversations",
        "messages",
        "pending_turns",
        "provider_settings",
        "model_cache",
    ] {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
                 )",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert!(exists, "expected table {table}");
    }
    let api_key_column_exists: bool = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM pragma_table_info('provider_settings')
                WHERE name = 'api_key'
             )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!api_key_column_exists);
}

#[test]
fn adds_pending_turns_to_a_version_one_database() {
    let mut connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                workspace_path TEXT,
                provider TEXT,
                model TEXT,
                archived INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE messages (
                id TEXT PRIMARY KEY NOT NULL,
                conversation_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT
            );
            PRAGMA user_version = 1;",
        )
        .unwrap();

    migrate_connection(&mut connection).unwrap();

    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM sqlite_master
                WHERE type = 'table' AND name = 'pending_turns'
             )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(exists);
}

#[test]
fn rejects_a_database_created_by_a_newer_application() {
    let mut connection = Connection::open_in_memory().unwrap();
    connection
        .pragma_update(None, "user_version", LATEST_DATABASE_VERSION + 1)
        .unwrap();

    let error = migrate_connection(&mut connection).unwrap_err();

    assert!(matches!(
        error,
        DatabaseError::UnsupportedFutureVersion(version)
            if version == LATEST_DATABASE_VERSION + 1
    ));
}

#[test]
fn migrates_an_existing_unversioned_database() {
    let mut connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE llm_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                provider TEXT NOT NULL,
                api_key TEXT NOT NULL,
                model TEXT
            );
            INSERT INTO llm_settings (id, provider, api_key, model)
            VALUES (1, 'kimi', 'secret', 'kimi-k3');",
        )
        .unwrap();

    migrate_connection(&mut connection).unwrap();

    let migrated_provider: String = connection
        .query_row(
            "SELECT provider FROM provider_settings WHERE provider = 'kimi'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(migrated_provider, "kimi");
    let plaintext_secret_count: u32 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'llm_settings'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(plaintext_secret_count, 0);
    let archived_column_exists: bool = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM pragma_table_info('conversations')
                WHERE name = 'archived'
             )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(archived_column_exists);
}
