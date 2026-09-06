//! User-global UI theme preference: a single opaque built-in theme id.
//!
//! Rust persists only a well-formed theme id string in the `ui_preferences`
//! singleton -- never palette values. TypeScript owns the built-in catalog,
//! display names, and unknown-id fallback, so an unknown-but-well-formed id
//! round-trips unchanged and the TUI resolves it to the default preset. Only
//! *shape* (not catalog membership) is validated here, matching the plan's
//! "validate shape, not catalog membership, in Rust" decision.
//!
//! Like [`super::ActiveSelection`], this is a single global row shared by every
//! `kqode` instance for the OS user: switching it in one process is visible to
//! the others on their next read (last writer wins), which is expected, not
//! corruption.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, params};

use super::Store;

/// Maximum accepted length of a persisted theme id. Generous next to the
/// built-in kebab-case ids (e.g. `gruvbox-dark`), but bounded so a malformed
/// write can't bloat the singleton row.
pub const MAX_THEME_ID_LEN: usize = 64;

/// Whether `theme_id` is a well-formed opaque id worth persisting: non-empty
/// after trimming, within [`MAX_THEME_ID_LEN`], and free of control characters.
///
/// Catalog membership is deliberately *not* checked here -- resolving an unknown
/// id to the default preset is the TUI's job, so unknown-but-well-formed ids are
/// accepted and round-trip unchanged.
#[must_use]
pub fn is_valid_theme_id(theme_id: &str) -> bool {
    !theme_id.trim().is_empty()
        && theme_id.len() <= MAX_THEME_ID_LEN
        && !theme_id.chars().any(char::is_control)
}

impl Store {
    /// Reads the saved theme id, or `None` when unset.
    ///
    /// A missing row *and* a row with a `NULL` theme id both read as `None`, so
    /// callers treat either as "use the default theme".
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn theme_id(&self) -> rusqlite::Result<Option<String>> {
        self.connect()?
            .query_row(
                "SELECT theme_id FROM ui_preferences WHERE id = 1",
                [],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(Option::flatten)
    }

    /// Persists the selected theme id in the `ui_preferences` singleton
    /// (last-writer-wins), returning whether it was stored.
    ///
    /// A malformed id (see [`is_valid_theme_id`]) is rejected *before* any write
    /// and returns `Ok(false)`, leaving a previously stored preference
    /// untouched. This lets the backend distinguish three outcomes without
    /// error strings: `Ok(true)` saved, `Ok(false)` rejected as malformed, and
    /// `Err(_)` a store write failure. The `id = 1` / `CHECK` singleton
    /// guarantees a buggy insert can't create two preference rows.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn set_theme_id(&self, theme_id: &str) -> rusqlite::Result<bool> {
        if !is_valid_theme_id(theme_id) {
            return Ok(false);
        }
        self.connect()?.execute(
            "INSERT INTO ui_preferences (id, theme_id, updated_at) \
             VALUES (1, ?1, ?2) \
             ON CONFLICT(id) DO UPDATE SET \
                theme_id = excluded.theme_id, \
                updated_at = excluded.updated_at",
            params![theme_id, now_ms()],
        )?;
        Ok(true)
    }

    /// Clears any saved theme id (future starts fall back to the default),
    /// keeping the singleton row with a `NULL` theme id rather than deleting it.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn clear_theme_id(&self) -> rusqlite::Result<()> {
        self.connect()?.execute(
            "INSERT INTO ui_preferences (id, theme_id, updated_at) \
             VALUES (1, NULL, ?1) \
             ON CONFLICT(id) DO UPDATE SET theme_id = NULL, updated_at = excluded.updated_at",
            params![now_ms()],
        )?;
        Ok(())
    }
}

/// Current time as epoch milliseconds (0 before the epoch, which cannot occur).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
