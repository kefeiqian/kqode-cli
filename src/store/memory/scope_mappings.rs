//! Registered memory scope ids used to validate protocol-supplied scope roots.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::params;

use crate::memory::MemoryScope;
use crate::store::Store;

impl Store {
    /// Records a backend-derived opaque memory scope id.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_memory_scope_mapping(
        &self,
        scope: MemoryScope,
        scope_id: &str,
        canonical_key: &str,
    ) -> rusqlite::Result<()> {
        let now = now_ms();
        self.connect()?.execute(
            "INSERT INTO memory_scope_mappings \
                (scope, scope_id, canonical_key, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?4) \
             ON CONFLICT(scope, scope_id) DO UPDATE SET \
                canonical_key = excluded.canonical_key, \
                updated_at = excluded.updated_at",
            params![scope.as_str(), scope_id, canonical_key, now],
        )?;
        Ok(())
    }

    /// Whether a caller-supplied memory scope id is known to the backend.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn memory_scope_mapping_exists(
        &self,
        scope: MemoryScope,
        scope_id: &str,
    ) -> rusqlite::Result<bool> {
        self.connect()?.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM memory_scope_mappings
                WHERE scope = ?1 AND scope_id = ?2
            )",
            params![scope.as_str(), scope_id],
            |row| row.get(0),
        )
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
