//! Non-secret provider settings + the single global active `(provider, model)`.
//!
//! **No key material is ever stored here** — not even a hash, prefix, or
//! fingerprint. The only credential-adjacent column is a non-secret
//! `key_present` bit that keeps status derivation off the keychain hot path.
//! Secrets live in the OS keychain (added in a later unit), never in SQLite.
//!
//! The active selection is a single global row, so concurrent `kqode` instances
//! share one `(provider, model)`: switching it in one process becomes visible to
//! the others on their next read (last writer wins), which is expected, not
//! corruption.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, params};

use super::Store;
use crate::provider::ProviderId;

/// Non-secret persisted settings for one provider.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderSettings {
    /// Stable cross-boundary provider id.
    pub provider: ProviderId,
    /// Base/displayed endpoint URL.
    pub base_url: String,
    /// Optional user-facing label.
    pub label: Option<String>,
    /// Whether a key is resolvable for this provider (set *last* on connect,
    /// only after the keychain write succeeds; cleared on clear).
    pub key_present: bool,
    /// Epoch-millis of the last successful connect, if any.
    pub last_connected_at: Option<i64>,
}

/// The single global active `(provider, model)` selection.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActiveSelection {
    /// The active provider.
    pub provider: ProviderId,
    /// The active model id within that provider.
    pub model_id: String,
}

impl Store {
    /// Upserts a provider's non-secret settings (last-writer-wins), preserving
    /// `created_at` across updates.
    ///
    /// Callers connecting a provider must write this row (with `key_present`
    /// still false) **before** the keychain key, then flip the flag with
    /// [`Store::set_key_present`] — see that method for the ordering rationale.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_provider_settings(&self, settings: &ProviderSettings) -> rusqlite::Result<()> {
        let now = now_ms();
        self.connect()?.execute(
            "INSERT INTO provider_settings \
                (provider_id, base_url, label, key_present, last_connected_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) \
             ON CONFLICT(provider_id) DO UPDATE SET \
                base_url = excluded.base_url, \
                label = excluded.label, \
                key_present = excluded.key_present, \
                last_connected_at = excluded.last_connected_at, \
                updated_at = excluded.updated_at",
            params![
                settings.provider.as_str(),
                settings.base_url,
                settings.label,
                i64::from(settings.key_present),
                settings.last_connected_at,
                now,
            ],
        )?;
        Ok(())
    }

    /// Reads a provider's settings, or `None` when no row exists.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn provider_settings(
        &self,
        provider: ProviderId,
    ) -> rusqlite::Result<Option<ProviderSettings>> {
        self.connect()?
            .query_row(
                "SELECT base_url, label, key_present, last_connected_at \
                 FROM provider_settings WHERE provider_id = ?1",
                params![provider.as_str()],
                |row| {
                    Ok(ProviderSettings {
                        provider,
                        base_url: row.get(0)?,
                        label: row.get(1)?,
                        key_present: row.get::<_, i64>(2)? != 0,
                        last_connected_at: row.get(3)?,
                    })
                },
            )
            .optional()
    }

    /// Sets the `key_present` bit for an existing provider row.
    ///
    /// This is deliberately separate from [`Store::upsert_provider_settings`] so
    /// the connect flow can set the flag **last**, only after the keychain write
    /// succeeds. Otherwise a crash (or a keychain failure) between flag and key
    /// would leave `key_present = true` with no resolvable key — a false
    /// "connected" whose every submit reroutes to `/connect`. A no-op if the row
    /// is absent (settings are always written first).
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn set_key_present(&self, provider: ProviderId, present: bool) -> rusqlite::Result<()> {
        self.connect()?.execute(
            "UPDATE provider_settings SET key_present = ?2, updated_at = ?3 WHERE provider_id = ?1",
            params![provider.as_str(), i64::from(present), now_ms()],
        )?;
        Ok(())
    }

    /// Sets the single active selection (last-writer-wins). The `id = 1` /
    /// `CHECK` singleton guarantees a buggy insert can't create two active rows.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn set_active_selection(&self, selection: &ActiveSelection) -> rusqlite::Result<()> {
        self.connect()?.execute(
            "INSERT INTO active_selection (id, provider_id, model_id, updated_at) \
             VALUES (1, ?1, ?2, ?3) \
             ON CONFLICT(id) DO UPDATE SET \
                provider_id = excluded.provider_id, \
                model_id = excluded.model_id, \
                updated_at = excluded.updated_at",
            params![selection.provider.as_str(), selection.model_id, now_ms()],
        )?;
        Ok(())
    }

    /// Reads the active selection, or `None` when unset (or the stored provider
    /// id is unknown to this binary — treated as unset so resolution falls back
    /// to an effective default rather than crashing).
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn active_selection(&self) -> rusqlite::Result<Option<ActiveSelection>> {
        let row = self
            .connect()?
            .query_row(
                "SELECT provider_id, model_id FROM active_selection WHERE id = 1",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        Ok(row.and_then(|(provider_id, model_id)| {
            ProviderId::parse(&provider_id).map(|provider| ActiveSelection { provider, model_id })
        }))
    }
}

/// Current time as epoch milliseconds (0 before the epoch, which cannot occur).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
