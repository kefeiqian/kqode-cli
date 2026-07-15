//! Shared filesystem paths for KQode's per-user home directory.
//!
//! Centralizes home-directory resolution so `debug_log`, the SQLite store, and
//! future callers agree on where `~/.kqode` lives. Hand-rolled (no `dirs`
//! crate) to keep the dependency surface small.

use std::env;
use std::path::PathBuf;

/// Per-user KQode home directory name (`~/.kqode`). Mirrors the TUI's `KQODE_HOME_DIRNAME`.
pub const KQODE_HOME_DIRNAME: &str = ".kqode";

/// SQLite database filename under the KQode home.
const DB_FILENAME: &str = "kqode.db";

/// Local memory directory name under the KQode home.
const MEMORY_DIRNAME: &str = "memory";

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

/// Resolves the SQLite database file path: `<kqode_home>/kqode.db`.
///
/// Returns `None` when the home cannot be resolved. Tests bootstrap the store
/// at an explicit temp path via `Store::open_or_bootstrap_at` rather than
/// overriding this resolver.
#[must_use]
pub fn db_path() -> Option<PathBuf> {
    Some(kqode_home()?.join(DB_FILENAME))
}

/// Resolves the local memory root: `<kqode_home>/memory`.
///
/// Returns `None` when the home cannot be resolved. Callers that need a
/// test-controlled root construct [`crate::memory::ScopeRoots`] with an explicit
/// base instead of overriding this resolver.
#[must_use]
pub fn memory_dir() -> Option<PathBuf> {
    Some(kqode_home()?.join(MEMORY_DIRNAME))
}

#[cfg(test)]
mod tests;
