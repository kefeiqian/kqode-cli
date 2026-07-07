use std::path::{Path, PathBuf};

/// Whether a refinery history error should direct the user to upgrade instead of reset.
pub(super) fn is_upgrade_only_history_error(err: &refinery::Error) -> bool {
    match err.kind() {
        refinery::error::Kind::DivergentVersion(_, _) => true,
        refinery::error::Kind::MissingVersion(migration) => {
            i64::from(migration.version()) > super::migrations::latest_version()
        }
        _ => false,
    }
}

/// Whether a SQLite open/pragma failure indicates a resettable corrupt DB file.
pub(super) fn is_resettable_open_error(err: &rusqlite::Error) -> bool {
    matches!(
        err,
        rusqlite::Error::SqliteFailure(inner, message)
            if inner.code == rusqlite::ErrorCode::DatabaseCorrupt
                || inner.code == rusqlite::ErrorCode::NotADatabase
                || message
                    .as_deref()
                    .is_some_and(|message| message.contains("not a database"))
    )
}

/// Builds the reset remedy for the DB file and its WAL/SHM sidecars.
pub(super) fn reset_remedy(path: &Path) -> String {
    let wal = sidecar_path(path, "-wal");
    let shm = sidecar_path(path, "-shm");
    format!(
        "After KQode exits, delete `{}`, `{}`, and `{}`, then restart; the index rebuilds from JSONL.",
        path.display(),
        wal.display(),
        shm.display()
    )
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut os_path = path.as_os_str().to_owned();
    os_path.push(suffix);
    PathBuf::from(os_path)
}
