use super::*;
use crate::provider::ProviderId;
use refinery::error::Kind;
use rusqlite::Connection;
use std::process::Command;
use std::time::Duration;

const CHILD_BOOTSTRAP_DB_ENV: &str = "KQODE_STORE_BOOTSTRAP_CHILD_DB";

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

const EXPECTED_TABLES: [&str; 5] = [
    "active_selection",
    "provider_settings",
    "refinery_schema_history",
    "sessions",
    "turns",
];

#[derive(Debug, PartialEq, Eq)]
struct HistoryRow {
    version: i64,
    name: String,
    checksum: String,
}

fn history_rows(conn: &Connection) -> Vec<HistoryRow> {
    let mut stmt = conn
        .prepare("SELECT version, name, checksum FROM refinery_schema_history ORDER BY version ASC")
        .unwrap();
    stmt.query_map([], |row| {
        Ok(HistoryRow {
            version: row.get(0)?,
            name: row.get(1)?,
            checksum: row.get(2)?,
        })
    })
    .unwrap()
    .map(Result::unwrap)
    .collect()
}

fn create_refinery_history(conn: &Connection) {
    conn.execute_batch(&format!(
        "CREATE TABLE {}(
             version int4 PRIMARY KEY,
             name VARCHAR(255),
             applied_on VARCHAR(255),
             checksum VARCHAR(255)
         );",
        migrations::REFINERY_SCHEMA_HISTORY_TABLE
    ))
    .unwrap();
}

fn seed_history_row(conn: &Connection, version: i64, name: &str, checksum: u64) {
    seed_raw_history_row(
        conn,
        version,
        name,
        "2026-07-07T00:00:00Z",
        &checksum.to_string(),
    );
}

fn seed_raw_history_row(
    conn: &Connection,
    version: i64,
    name: &str,
    applied_on: &str,
    checksum: &str,
) {
    conn.execute(
        "INSERT INTO refinery_schema_history (version, name, applied_on, checksum)
         VALUES (?1, ?2, ?3, ?4)",
        (version, name, applied_on, checksum),
    )
    .unwrap();
}

fn remove_db_with_sidecars(path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(recovery::sidecar_path(path, suffix));
    }
}

#[test]
fn fresh_path_bootstraps_to_latest_with_all_tables() {
    let (_dir, path) = temp_db();
    let store = Store::open_or_bootstrap_at(path).expect("bootstrap");
    let conn = store.connect().expect("connect");
    assert_eq!(migrations::user_version(&conn).unwrap(), 0);
    assert_eq!(migrations::applied_max_version(&conn).unwrap(), Some(1));
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
    let rows = history_rows(&conn);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].version, 1);
    assert_eq!(rows[0].name, "initial_schema");
    assert_eq!(rows[0].checksum, migrations::v1_checksum().to_string());
}

#[test]
#[ignore]
fn bootstrap_child_process() {
    Store::open_or_bootstrap_at(child_db_path()).expect("child bootstrap");
}

#[test]
#[ignore]
fn bootstrap_lock_timeout_child_process() {
    let err = lock::acquire_for_test(
        &child_db_path(),
        Duration::from_millis(80),
        Duration::from_millis(10),
    )
    .unwrap_err();
    assert!(matches!(
        err,
        StoreError::BootstrapLockTimeout { timeout_ms: 80 }
    ));
}

#[test]
fn concurrent_bootstraps_across_processes_all_succeed() {
    let (_dir, path) = temp_db();
    let exe = std::env::current_exe().expect("current test executable");
    let mut children = Vec::new();
    for _ in 0..4 {
        children.push(
            Command::new(&exe)
                .arg("--exact")
                .arg("store::tests::bootstrap_child_process")
                .arg("--ignored")
                .env(CHILD_BOOTSTRAP_DB_ENV, &path)
                .env("KQODE_STORE_BOOTSTRAP_HOLD_LOCK_MS", "150")
                .spawn()
                .expect("spawn child bootstrap process"),
        );
    }

    let mut combined_output = String::new();
    for child in children {
        let output = child.wait_with_output().expect("wait for child process");
        combined_output.push_str(&String::from_utf8_lossy(&output.stdout));
        combined_output.push_str(&String::from_utf8_lossy(&output.stderr));
        assert!(output.status.success(), "child failed:\n{combined_output}");
    }
    assert!(
        !combined_output.contains("table provider_settings already exists"),
        "race surfaced duplicate-create failure:\n{combined_output}"
    );

    let store = Store::open_or_bootstrap_at(path).unwrap();
    let conn = store.connect().unwrap();
    assert_eq!(history_rows(&conn).len(), 1);
    assert_eq!(migrations::applied_max_version(&conn).unwrap(), Some(1));
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
}

#[test]
fn bootstrap_lock_timeout_is_typed() {
    let (_dir, path) = temp_db();
    let _lock = lock::acquire_for_test(
        &path,
        Duration::from_millis(1_000),
        Duration::from_millis(10),
    )
    .expect("parent lock");
    let exe = std::env::current_exe().expect("current test executable");
    let output = Command::new(&exe)
        .arg("--exact")
        .arg("store::tests::bootstrap_lock_timeout_child_process")
        .arg("--ignored")
        .env(CHILD_BOOTSTRAP_DB_ENV, &path)
        .output()
        .expect("run timeout child process");
    assert!(
        output.status.success(),
        "timeout child failed:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn child_db_path() -> PathBuf {
    let path = std::env::var_os(CHILD_BOOTSTRAP_DB_ENV)
        .expect("child bootstrap DB path env var is required");
    PathBuf::from(path)
}

#[test]
fn reopening_a_migrated_db_is_idempotent() {
    let (_dir, path) = temp_db();
    Store::open_or_bootstrap_at(path.clone()).expect("first bootstrap");
    let store = Store::open_or_bootstrap_at(path).expect("second bootstrap is a no-op");
    let conn = store.connect().unwrap();
    assert_eq!(migrations::applied_max_version(&conn).unwrap(), Some(1));
    assert_eq!(history_rows(&conn).len(), 1);
    assert_eq!(table_names(&conn), EXPECTED_TABLES);
}

#[test]
fn a_version_zero_db_migrates_forward() {
    let (_dir, path) = temp_db();
    // refinery owns version history, so SQLite user_version stays at 0.
    {
        let conn = Connection::open(&path).unwrap();
        assert_eq!(migrations::user_version(&conn).unwrap(), 0);
        assert!(table_names(&conn).is_empty());
    }
    let store = Store::open_or_bootstrap_at(path).expect("bootstrap");
    let conn = store.connect().unwrap();
    assert_eq!(migrations::user_version(&conn).unwrap(), 0);
    assert_eq!(migrations::applied_max_version(&conn).unwrap(), Some(1));
}

#[test]
fn v1_migration_checksum_is_pinned() {
    assert_eq!(
        migrations::v1_checksum(),
        17197033309386186228,
        "editing a shipped V1 migration must intentionally update this pin"
    );
}

#[test]
fn divergent_applied_migration_surfaces_a_store_error() {
    let (_dir, path) = temp_db();
    Store::open_or_bootstrap_at(path.clone()).expect("bootstrap");
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "UPDATE refinery_schema_history SET checksum = '0' WHERE version = 1",
            [],
        )
        .unwrap();
    }
    let err = Store::open_or_bootstrap_at(path).unwrap_err();
    match err.root_cause() {
        StoreError::MigrationHistory(err) => {
            assert!(matches!(err.kind(), Kind::DivergentVersion(_, _)));
        }
        other => panic!("expected divergent migration history, got {other:?}"),
    }
    let message = err.to_string().to_lowercase();
    assert!(message.contains("upgrade"));
    assert!(
        !message.contains("delete"),
        "divergent-history remedy must not instruct deletion: {message}"
    );
}

#[test]
fn db_ahead_of_embedded_migrations_refuses_to_bootstrap() {
    let (_dir, path) = temp_db();
    {
        let conn = Connection::open(&path).unwrap();
        create_refinery_history(&conn);
        seed_history_row(&conn, 2, "future_schema", 1);
    }
    let err = Store::open_or_bootstrap_at(path.clone()).unwrap_err();
    match err.root_cause() {
        StoreError::MigrationHistory(err) => {
            assert!(matches!(err.kind(), Kind::MissingVersion(_)));
        }
        other => panic!("expected missing migration history, got {other:?}"),
    }
    let message = err.to_string().to_lowercase();
    assert!(message.contains("upgrade"));
    assert!(
        !message.contains("delete"),
        "DB-ahead remedy must not instruct deletion: {message}"
    );
    assert!(path.exists(), "a DB-ahead failure must never auto-delete");
}

#[test]
fn legacy_user_version_one_db_gets_reset_message_and_can_rebootstrap_after_delete() {
    let (_dir, path) = temp_db();
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../../migrations/V1__initial_schema.sql"))
            .unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
    }
    let err = Store::open_or_bootstrap_at(path.clone()).unwrap_err();
    match err.root_cause() {
        StoreError::LegacyReset {
            user_version,
            table_count,
        } => {
            assert_eq!(*user_version, 1);
            assert_eq!(*table_count, 4);
        }
        other => panic!("expected legacy reset error, got {other:?}"),
    }
    let message = err.to_string();
    assert!(message.contains(STORE_FATAL_SENTINEL));
    assert!(message.contains(&path.display().to_string()));
    assert!(message.contains("-wal"));
    assert!(message.contains("-shm"));
    assert!(message.to_lowercase().contains("delete"));

    remove_db_with_sidecars(&path);
    let store = Store::open_or_bootstrap_at(path).expect("fresh bootstrap after reset");
    let conn = store.connect().unwrap();
    assert_eq!(migrations::applied_max_version(&conn).unwrap(), Some(1));
}

#[test]
fn dirty_app_table_without_history_gets_reset_message_not_table_exists() {
    let (_dir, path) = temp_db();
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE provider_settings (id INTEGER);")
            .unwrap();
    }
    let err = Store::open_or_bootstrap_at(path.clone()).unwrap_err();
    match err.root_cause() {
        StoreError::LegacyReset {
            user_version,
            table_count,
        } => {
            assert_eq!(*user_version, 0);
            assert_eq!(*table_count, 1);
        }
        other => panic!("expected dirty reset error, got {other:?}"),
    }
    let message = err.to_string();
    assert!(message.contains(&path.display().to_string()));
    assert!(message.to_lowercase().contains("delete"));
    assert!(
        !message.contains("table provider_settings already exists"),
        "dirty schema should be classified before refinery runs"
    );
}

#[test]
fn malformed_history_applied_on_surfaces_store_error_without_panicking() {
    let (_dir, path) = temp_db();
    {
        let conn = Connection::open(&path).unwrap();
        create_refinery_history(&conn);
        seed_raw_history_row(
            &conn,
            1,
            "initial_schema",
            "not-rfc3339",
            &migrations::v1_checksum().to_string(),
        );
    }
    let err = Store::open_or_bootstrap_at(path).unwrap_err();
    match err.root_cause() {
        StoreError::MigrationHistoryCorrupt(reason) => {
            assert!(reason.contains("invalid applied_on"));
        }
        other => panic!("expected malformed history error, got {other:?}"),
    }
    let message = err.to_string().to_lowercase();
    assert!(message.contains("delete"));
    assert!(message.contains("-wal"));
    assert!(message.contains("-shm"));
}

#[test]
fn malformed_history_checksum_surfaces_store_error_without_panicking() {
    let (_dir, path) = temp_db();
    {
        let conn = Connection::open(&path).unwrap();
        create_refinery_history(&conn);
        seed_raw_history_row(
            &conn,
            1,
            "initial_schema",
            "2026-07-07T00:00:00Z",
            "not-a-u64",
        );
    }
    let err = Store::open_or_bootstrap_at(path).unwrap_err();
    match err.root_cause() {
        StoreError::MigrationHistoryCorrupt(reason) => {
            assert!(reason.contains("invalid checksum"));
        }
        other => panic!("expected malformed history error, got {other:?}"),
    }
    let message = err.to_string().to_lowercase();
    assert!(message.contains("delete"));
    assert!(message.contains("-wal"));
    assert!(message.contains("-shm"));
}

#[test]
fn sanity_check_reports_history_version_mismatch() {
    let (_dir, path) = temp_db();
    let store = Store::open_or_bootstrap_at(path).unwrap();
    let conn = store.connect().unwrap();
    conn.execute("DELETE FROM refinery_schema_history", [])
        .unwrap();
    let err = sanity_check(&conn).unwrap_err();
    assert!(matches!(
        err,
        StoreError::SchemaHistoryMismatch {
            found: None,
            known: 1
        }
    ));
}

#[test]
fn missing_prior_migration_refuses_to_bootstrap() {
    let (_dir, path) = temp_db();
    {
        let conn = Connection::open(&path).unwrap();
        create_refinery_history(&conn);
        seed_history_row(&conn, 0, "older_schema", 1);
    }
    let result = Store::open_or_bootstrap_at(path.clone());
    let err = result.unwrap_err();
    assert!(matches!(err.root_cause(), StoreError::MigrationHistory(_)));
    let message = err.to_string().to_lowercase();
    assert!(message.contains("delete"));
    assert!(message.contains("-wal"));
    assert!(message.contains("-shm"));
    assert!(
        path.exists(),
        "a migration history failure must never auto-delete"
    );
}

#[test]
fn a_corrupt_file_surfaces_a_typed_error_without_panicking() {
    let (_dir, path) = temp_db();
    // Non-SQLite bytes: the WAL pragma / first read fails, exercising the same
    // fallible/degrade path a WAL-set failure would take.
    std::fs::write(&path, b"this is not a sqlite database").unwrap();
    let result = Store::open_or_bootstrap_at(path.clone());
    let err = result.expect_err("corrupt DB degrades, not panics");
    let message = err.to_string().to_lowercase();
    assert!(message.contains(&path.display().to_string().to_lowercase()));
    assert!(message.contains("delete"));
    assert!(message.contains("-wal"));
    assert!(message.contains("-shm"));
    assert!(path.exists(), "a failed-to-open DB is never auto-deleted");
}

#[test]
fn directory_db_path_keeps_filesystem_remedy_not_reset_remedy() {
    let (dir, _path) = temp_db();
    let path = dir.path().join("as-directory");
    std::fs::create_dir(&path).unwrap();
    let err = Store::open_or_bootstrap_at(path.clone()).unwrap_err();
    let message = err.to_string();
    assert!(matches!(err.root_cause(), StoreError::Open(_)));
    assert!(message.contains(&path.display().to_string()));
    assert!(message.contains("Fix filesystem permissions"));
    assert!(
        !message.to_lowercase().contains("delete"),
        "non-resettable open failures should not use reset remedy: {message}"
    );
    assert!(
        path.is_dir(),
        "a failed-to-open DB path is never auto-deleted"
    );
}

#[test]
fn an_uncreatable_parent_dir_surfaces_create_dir_error() {
    let dir = tempfile::tempdir().unwrap();
    // Parent resolves *through* a regular file, so `create_dir_all` must fail.
    let blocker = dir.path().join("blocker");
    std::fs::write(&blocker, b"x").unwrap();
    let path = blocker.join("nested").join("kqode.db");
    let result = Store::open_or_bootstrap_at(path.clone());
    let err = result.unwrap_err();
    assert!(matches!(err.root_cause(), StoreError::CreateDir(_)));
    let message = err.to_string();
    assert!(message.starts_with(STORE_FATAL_SENTINEL));
    assert!(message.contains(&path.display().to_string()));
    assert!(message.contains("Fix filesystem permissions"));
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
        .query_row("SELECT count(*) FROM active_selection", [], |row| {
            row.get(0)
        })
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
        .query_row("SELECT count(*) FROM provider_settings", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(rows, 1, "upsert updates in place, never duplicates");
    assert_eq!(
        store.provider_settings(ProviderId::Kimi).unwrap(),
        Some(settings)
    );
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
        assert!(
            !secretish,
            "column {column:?} looks like it stores a secret"
        );
    }
}
