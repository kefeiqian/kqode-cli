use std::path::{Path, PathBuf};

/// Whether a refinery history error should direct the user to upgrade rather than
/// reset the rebuildable index.
///
/// Only a DB that is genuinely *ahead* of this binary is fixed by upgrading: an
/// applied migration whose version this binary does not embed at all
/// (`MissingVersion` above `latest_version`). Its data is intact and must not be
/// deleted — a newer binary that knows the migration will accept it.
///
/// A `DivergentVersion` is a checksum mismatch on a version this binary *does*
/// embed — e.g. historical CRLF-to-LF line-ending drift on an immutable migration.
/// No forward binary can ever match the stored checksum, so upgrading is a dead
/// end; the rebuildable index must be reset instead.
pub(super) fn is_upgrade_only_history_error(err: &refinery::Error) -> bool {
    match err.kind() {
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

pub(super) fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut os_path = path.as_os_str().to_owned();
    os_path.push(suffix);
    PathBuf::from(os_path)
}
