//! Per-session identity, manifest, and retention for backend debug logs.
//!
//! A session corresponds to one backend process spawn. The id is short,
//! sortable, and filesystem-safe: the millisecond epoch plus the process id.

use std::fs;
use std::path::Path;

use serde::Serialize;

use super::epoch_millis;

/// Number of most-recent session directories to keep when pruning.
pub(super) const SESSION_RETENTION: usize = 20;

/// Filename of the per-session backend transcript log.
pub(super) const BACKEND_LOG_FILENAME: &str = "backend.jsonl";

/// Filename of the per-session manifest.
const SESSION_MANIFEST_FILENAME: &str = "session.json";

/// Mints a session id for this backend spawn: `<epoch_millis>-<pid_hex>`.
///
/// Sortable by start time and unique per spawn (one backend process is one
/// session), and safe as a path component on every platform.
pub(super) fn generate_session_id() -> String {
    format!("{}-{:x}", epoch_millis(), std::process::id())
}

/// The `session.json` manifest describing one session.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionManifest {
    session_id: String,
    started_at_ms: u64,
    kqode_version: &'static str,
    cwd: Option<String>,
    os: &'static str,
}

/// Writes `<session_dir>/session.json` (best-effort; errors are ignored).
///
/// Git repo/branch and the active model are intentionally omitted for now —
/// both may be unknown at session start (see the plan's deferred items).
pub(super) fn write_manifest(session_dir: &Path, session_id: &str) {
    let manifest = SessionManifest {
        session_id: session_id.to_owned(),
        started_at_ms: epoch_millis(),
        kqode_version: env!("CARGO_PKG_VERSION"),
        cwd: std::env::current_dir()
            .ok()
            .map(|path| path.display().to_string()),
        os: std::env::consts::OS,
    };
    if let Ok(json) = serde_json::to_vec_pretty(&manifest) {
        let _ = fs::write(session_dir.join(SESSION_MANIFEST_FILENAME), json);
    }
}

/// Prunes `logs_root` to the most recent [`SESSION_RETENTION`] session
/// directories by modification time (best-effort; never fails the caller).
///
/// Modification time — rather than name — is used so the prune treats
/// backend session dirs and TUI `orphan-*` dirs uniformly by recency.
pub(super) fn prune_old_sessions(logs_root: &Path) {
    let Ok(entries) = fs::read_dir(logs_root) else {
        return;
    };
    let mut dirs: Vec<(std::time::SystemTime, std::path::PathBuf)> = entries
        .flatten()
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect();
    if dirs.len() <= SESSION_RETENTION {
        return;
    }
    // Newest first, then drop everything past the retention window.
    dirs.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in dirs.into_iter().skip(SESSION_RETENTION) {
        let _ = fs::remove_dir_all(path);
    }
}
