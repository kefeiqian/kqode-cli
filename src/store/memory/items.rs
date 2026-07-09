//! SQLite projection + queries for memory item metadata.
//!
//! Rows are a rebuildable projection of the topic markdown files; the file is
//! always the truth. Each store method opens a fresh connection per operation,
//! matching the provider/session store pattern.

use rusqlite::{Connection, OptionalExtension, params};

use super::parse_or_err;
use crate::memory::{MemoryItem, MemoryScope, MemorySource, MemoryType};
use crate::store::Store;

/// Projected metadata for one memory topic file.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredMemoryItem {
    pub id: String,
    pub scope: MemoryScope,
    /// Opaque scope id; `None` (stored as `''`) for user-global.
    pub scope_id: Option<String>,
    pub memory_type: MemoryType,
    pub title: String,
    pub active: bool,
    pub source: MemorySource,
    pub source_session_id: Option<String>,
    pub source_turn_start: Option<u64>,
    pub source_turn_end: Option<u64>,
    pub content_hash: String,
    /// Absolute topic-file path (the truth this row projects).
    pub file_path: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl StoredMemoryItem {
    /// Projects a parsed [`MemoryItem`] and its on-disk path into a store row.
    #[must_use]
    pub fn from_item(item: MemoryItem, file_path: String) -> Self {
        Self {
            id: item.id,
            scope: item.scope,
            scope_id: item.scope_id,
            memory_type: item.memory_type,
            title: item.title,
            active: item.active,
            source: item.provenance.source,
            source_session_id: item.provenance.source_session_id,
            source_turn_start: item.provenance.source_turn_start,
            source_turn_end: item.provenance.source_turn_end,
            content_hash: item.content_hash,
            file_path,
            created_at: item.provenance.created_at_ms,
            updated_at: item.provenance.updated_at_ms,
        }
    }
}

/// Upserts one item row on an existing connection (shared by direct writes and
/// the reindex transaction).
pub(super) fn upsert_item_on(conn: &Connection, item: &StoredMemoryItem) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO memory_items \
            (id, scope, scope_id, memory_type, title, active, source, \
             source_session_id, source_turn_start, source_turn_end, \
             content_hash, file_path, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
         ON CONFLICT(scope, scope_id, id) DO UPDATE SET \
            memory_type = excluded.memory_type, title = excluded.title, \
            active = excluded.active, source = excluded.source, \
            source_session_id = excluded.source_session_id, \
            source_turn_start = excluded.source_turn_start, \
            source_turn_end = excluded.source_turn_end, \
            content_hash = excluded.content_hash, file_path = excluded.file_path, \
            created_at = excluded.created_at, updated_at = excluded.updated_at",
        params![
            item.id,
            item.scope.as_str(),
            item.scope_id.as_deref().unwrap_or(""),
            item.memory_type.as_str(),
            item.title,
            i64::from(item.active),
            item.source.as_str(),
            item.source_session_id,
            item.source_turn_start.map(|seq| seq as i64),
            item.source_turn_end.map(|seq| seq as i64),
            item.content_hash,
            item.file_path,
            item.created_at,
            item.updated_at,
        ],
    )?;
    Ok(())
}

fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredMemoryItem> {
    let scope: String = row.get(1)?;
    let scope_id: String = row.get(2)?;
    let memory_type: String = row.get(3)?;
    let source: String = row.get(6)?;
    Ok(StoredMemoryItem {
        id: row.get(0)?,
        scope: parse_or_err(MemoryScope::parse(&scope), "scope")?,
        scope_id: Some(scope_id).filter(|value| !value.is_empty()),
        memory_type: parse_or_err(MemoryType::parse(&memory_type), "memory_type")?,
        title: row.get(4)?,
        active: row.get::<_, i64>(5)? != 0,
        source: parse_or_err(MemorySource::parse(&source), "source")?,
        source_session_id: row.get(7)?,
        source_turn_start: row.get::<_, Option<i64>>(8)?.map(|seq| seq as u64),
        source_turn_end: row.get::<_, Option<i64>>(9)?.map(|seq| seq as u64),
        content_hash: row.get(10)?,
        file_path: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const ITEM_COLUMNS: &str = "id, scope, scope_id, memory_type, title, active, source, \
     source_session_id, source_turn_start, source_turn_end, content_hash, file_path, \
     created_at, updated_at";

impl Store {
    /// Upserts one memory item projection row.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_memory_item(&self, item: &StoredMemoryItem) -> rusqlite::Result<()> {
        upsert_item_on(&self.connect()?, item)
    }

    /// Reads one memory item by scope + opaque scope id + id.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn memory_item(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
        id: &str,
    ) -> rusqlite::Result<Option<StoredMemoryItem>> {
        self.connect()?
            .query_row(
                &format!(
                    "SELECT {ITEM_COLUMNS} FROM memory_items \
                     WHERE scope = ?1 AND scope_id = ?2 AND id = ?3"
                ),
                params![scope.as_str(), scope_id.unwrap_or(""), id],
                row_to_item,
            )
            .optional()
    }

    /// Lists memory items in one scope, newest-updated first.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or query failure.
    pub fn list_memory_items(
        &self,
        scope: MemoryScope,
        scope_id: Option<&str>,
        active_only: bool,
    ) -> rusqlite::Result<Vec<StoredMemoryItem>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {ITEM_COLUMNS} FROM memory_items \
             WHERE scope = ?1 AND scope_id = ?2 AND (?3 = 0 OR active = 1) \
             ORDER BY updated_at DESC, id ASC"
        ))?;
        stmt.query_map(
            params![
                scope.as_str(),
                scope_id.unwrap_or(""),
                i64::from(active_only)
            ],
            row_to_item,
        )?
        .collect()
    }
}
