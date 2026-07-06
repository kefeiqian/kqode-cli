//! Shared filesystem paths for KQode's per-user home directory.
//!
//! Centralizes home-directory resolution so `debug_log`, the SQLite store, and
//! future callers agree on where `~/.kqode` lives. Hand-rolled (no `dirs`
//! crate) to keep the dependency surface small, mirroring the env-override
//! seam `debug_log` already uses for its log directory.

use std::env;
use std::path::PathBuf;

/// Per-user KQode home directory name (`~/.kqode`). Mirrors the TUI's `KQODE_HOME_DIRNAME`.
pub const KQODE_HOME_DIRNAME: &str = ".kqode";

/// Env var overriding the SQLite database file path (tests point it at a temp file).
pub const KQODE_DB_PATH_VAR: &str = "KQODE_DB_PATH";

/// SQLite database filename under the KQode home.
const DB_FILENAME: &str = "kqode.db";

/// Best-effort home directory from `USERPROFILE` (Windows) or `HOME` (Unix).
///
/// Returns `None` when neither variable is set to a non-empty value, so callers
/// degrade instead of panicking in a home-less environment.
#[must_use]
pub fn home_dir() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

/// The KQode home directory: `<home>/.kqode`.
///
/// Returns `None` when [`home_dir`] cannot be resolved.
#[must_use]
pub fn kqode_home() -> Option<PathBuf> {
    Some(home_dir()?.join(KQODE_HOME_DIRNAME))
}

/// Resolves the SQLite database file path.
///
/// `KQODE_DB_PATH` wins verbatim when set to a non-empty value; otherwise the
/// DB lives at `<kqode_home>/kqode.db`. Returns `None` only when no override is
/// set and the home cannot be resolved.
#[must_use]
pub fn db_path() -> Option<PathBuf> {
    if let Ok(path) = env::var(KQODE_DB_PATH_VAR)
        && !path.trim().is_empty()
    {
        return Some(PathBuf::from(path));
    }
    Some(kqode_home()?.join(DB_FILENAME))
}

#[cfg(test)]
mod tests;
