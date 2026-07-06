use super::*;
use crate::provider::ProviderId;
use rusqlite::Connection;
use std::thread;

/// A fresh temp directory + a DB path inside it. The `TempDir` guard cleans up
/// the DB plus its `-wal`/`-shm` sidecars on drop.
fn temp_db() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("kqode.db");
    (dir, path)
}

fn table_names(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

const EXPECTED_TABLES: [&str; 4] = ["active_selection", "provider_settings", "sessions", "turns"];

#[test]
fn fresh_path_bootstraps_to_latest_with_all_tables() {
    let (_dir, path) = temp_db();
    let store = Store::open_or_bootstrap_at(path).expect("bootstrap");
    let conn = store.connect().expect("connect");
    assert_eq!(migrations::user_version(&conn).unwrap(), LATEST_USER_VERSION);
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
}

#[test]
fn reopening_a_migrated_db_is_idempotent() {
    let (_dir, path) = temp_db();
    Store::open_or_bootstrap_at(path.clone()).expect("first bootstrap");
    let store = Store::open_or_bootstrap_at(path).expect("second bootstrap is a no-op");
    let conn = store.connect().unwrap();
    assert_eq!(migrations::user_version(&conn).unwrap(), LATEST_USER_VERSION);
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
}

#[test]
fn a_version_zero_db_migrates_forward() {
    let (_dir, path) = temp_db();
    // A brand-new DB starts at user_version 0 with no tables; bootstrap advances it.
    {
        let conn = Connection::open(&path).unwrap();
        assert_eq!(migrations::user_version(&conn).unwrap(), 0);
        assert!(table_names(&conn).is_empty());
    }
    let store = Store::open_or_bootstrap_at(path).expect("bootstrap");
    let conn = store.connect().unwrap();
    assert_eq!(migrations::user_version(&conn).unwrap(), LATEST_USER_VERSION);
}

#[test]
fn a_failed_step_rolls_back_and_a_later_open_recovers() {
    let (_dir, path) = temp_db();
    {
        let mut conn = Connection::open(&path).unwrap();
        // First statement succeeds, second is malformed: the whole step must roll back.
        let bad = "CREATE TABLE rollback_probe (id INTEGER); CREATE TABLE;";
        let result = migrations::apply_step(&mut conn, 1, bad);
        assert!(matches!(result, Err(StoreError::Migrate(_))));
        assert_eq!(migrations::user_version(&conn).unwrap(), 0, "version untouched");
        assert!(
            !table_names(&conn).contains(&"rollback_probe".to_owned()),
            "partial table must be rolled back"
        );
    }
    // A subsequent open recovers cleanly to the full schema.
    let store = Store::open_or_bootstrap_at(path).expect("recovers");
    let conn = store.connect().unwrap();
    assert_eq!(migrations::user_version(&conn).unwrap(), LATEST_USER_VERSION);
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
}

#[test]
fn concurrent_bootstraps_on_one_fresh_path_all_succeed() {
    let (_dir, path) = temp_db();
    let handles: Vec<_> = (0..4)
        .map(|_| {
            let path = path.clone();
            thread::spawn(move || Store::open_or_bootstrap_at(path))
        })
        .collect();
    for handle in handles {
        // Exactly-one-migrates is enforced by BEGIN IMMEDIATE + the in-lock
        // version re-check; the losers must not hit "table already exists".
        handle.join().unwrap().expect("every racer ends healthy");
    }
    let conn = Store::open_or_bootstrap_at(path).unwrap().connect().unwrap();
    assert_eq!(migrations::user_version(&conn).unwrap(), LATEST_USER_VERSION);
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
}

#[test]
fn a_newer_schema_degrades_without_touching_the_db() {
    let (_dir, path) = temp_db();
    Store::open_or_bootstrap_at(path.clone()).expect("bootstrap");
    {
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", LATEST_USER_VERSION + 1)
            .unwrap();
    }
    let result = Store::open_or_bootstrap_at(path.clone());
    assert!(matches!(
        result,
        Err(StoreError::NewerSchema {
            known: LATEST_USER_VERSION,
            ..
        })
    ));
    assert!(path.exists(), "a newer DB must never be auto-deleted");
}

#[test]
fn a_corrupt_file_surfaces_a_typed_error_without_panicking() {
    let (_dir, path) = temp_db();
    // Non-SQLite bytes: the WAL pragma / first read fails, exercising the same
    // fallible/degrade path a WAL-set failure would take.
    std::fs::write(&path, b"this is not a sqlite database").unwrap();
    let result = Store::open_or_bootstrap_at(path.clone());
    assert!(result.is_err(), "corrupt DB degrades, not panics");
    assert!(path.exists(), "a failed-to-open DB is never auto-deleted");
}

#[test]
fn an_uncreatable_parent_dir_surfaces_create_dir_error() {
    let dir = tempfile::tempdir().unwrap();
    // Parent resolves *through* a regular file, so `create_dir_all` must fail.
    let blocker = dir.path().join("blocker");
    std::fs::write(&blocker, b"x").unwrap();
    let path = blocker.join("nested").join("kqode.db");
    let result = Store::open_or_bootstrap_at(path);
    assert!(matches!(result, Err(StoreError::CreateDir(_))));
}

fn bootstrap() -> (tempfile::TempDir, Store) {
    let (dir, path) = temp_db();
    let store = Store::open_or_bootstrap_at(path).expect("bootstrap");
    (dir, store)
}

fn column_names(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

#[test]
fn set_then_get_active_selection_round_trips() {
    let (_dir, store) = bootstrap();
    let selection = ActiveSelection {
        provider: ProviderId::Kimi,
        model_id: "kimi-k2.7-code".to_owned(),
    };
    store.set_active_selection(&selection).unwrap();
    assert_eq!(store.active_selection().unwrap(), Some(selection));
}

#[test]
fn active_selection_is_none_when_unset() {
    let (_dir, store) = bootstrap();
    assert_eq!(store.active_selection().unwrap(), None);
}

#[test]
fn set_active_selection_is_last_writer_wins_on_the_singleton_row() {
    let (_dir, store) = bootstrap();
    store
        .set_active_selection(&ActiveSelection {
            provider: ProviderId::Kimi,
            model_id: "kimi-k2.7-code".to_owned(),
        })
        .unwrap();
    let latest = ActiveSelection {
        provider: ProviderId::Custom,
        model_id: "gpt-4o-mini".to_owned(),
    };
    store.set_active_selection(&latest).unwrap();
    let conn = store.connect().unwrap();
    let rows: i64 = conn
        .query_row("SELECT count(*) FROM active_selection", [], |row| row.get(0))
        .unwrap();
    assert_eq!(rows, 1, "singleton row is never duplicated");
    assert_eq!(store.active_selection().unwrap(), Some(latest));
}

#[test]
fn upsert_provider_settings_updates_without_duplicating() {
    let (_dir, store) = bootstrap();
    let mut settings = ProviderSettings {
        provider: ProviderId::Kimi,
        base_url: "https://api.moonshot.cn/v1".to_owned(),
        label: None,
        key_present: false,
        last_connected_at: None,
    };
    store.upsert_provider_settings(&settings).unwrap();
    settings.base_url = "https://api.moonshot.ai/v1".to_owned();
    settings.label = Some("Kimi".to_owned());
    store.upsert_provider_settings(&settings).unwrap();

    let conn = store.connect().unwrap();
    let rows: i64 = conn
        .query_row("SELECT count(*) FROM provider_settings", [], |row| row.get(0))
        .unwrap();
    assert_eq!(rows, 1, "upsert updates in place, never duplicates");
    assert_eq!(store.provider_settings(ProviderId::Kimi).unwrap(), Some(settings));
}

#[test]
fn set_key_present_flips_only_the_flag() {
    let (_dir, store) = bootstrap();
    let settings = ProviderSettings {
        provider: ProviderId::Kimi,
        base_url: "https://api.moonshot.cn/v1".to_owned(),
        label: None,
        key_present: false,
        last_connected_at: None,
    };
    store.upsert_provider_settings(&settings).unwrap();
    store.set_key_present(ProviderId::Kimi, true).unwrap();
    let stored = store.provider_settings(ProviderId::Kimi).unwrap().unwrap();
    assert!(stored.key_present);
    assert_eq!(stored.base_url, settings.base_url, "base url is untouched");
}

#[test]
fn provider_settings_is_none_for_an_absent_provider() {
    let (_dir, store) = bootstrap();
    assert_eq!(store.provider_settings(ProviderId::Custom).unwrap(), None);
}

#[test]
fn active_selection_survives_reopening_the_db() {
    // Covers AE7: the selection persists across process/connection lifetimes.
    let (_dir, path) = temp_db();
    let selection = ActiveSelection {
        provider: ProviderId::Custom,
        model_id: "llama-3.1-70b".to_owned(),
    };
    Store::open_or_bootstrap_at(path.clone())
        .unwrap()
        .set_active_selection(&selection)
        .unwrap();
    let reopened = Store::open_or_bootstrap_at(path).unwrap();
    assert_eq!(reopened.active_selection().unwrap(), Some(selection));
}

#[test]
fn no_key_or_secret_column_exists_in_the_schema() {
    let (_dir, store) = bootstrap();
    let conn = store.connect().unwrap();
    let columns = column_names(&conn, "provider_settings");
    assert_eq!(
        columns,
        [
            "provider_id",
            "base_url",
            "label",
            "key_present",
            "last_connected_at",
            "created_at",
            "updated_at",
        ]
    );
    for column in &columns {
        let secretish = matches!(column.as_str(), "secret" | "token" | "api_key" | "key_hash")
            || column.contains("secret")
            || column.contains("token")
            || column.ends_with("_key");
        assert!(!secretish, "column {column:?} looks like it stores a secret");
    }
}
