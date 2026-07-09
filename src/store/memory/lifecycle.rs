//! SQLite projection + queries for memory lifecycle state: inbox entries,
//! per-session extraction cursors, and correction suppression keys.
//!
//! These rows project the append-only `memory_events.jsonl` log (the truth), so
//! they are always rebuildable by replaying it (see the reindex in the parent
//! module). Rollback/diff payloads live in the log, not here.

use rusqlite::{Connection, OptionalExtension, params};

use super::parse_or_err;
use crate::memory::{InboxProposal, InboxStatus, MemoryScope, MemoryType};
use crate::store::Store;

/// Projected metadata for one inbox entry (no raw memory body).
#[derive(Clone, Debug, PartialEq)]
pub struct StoredInboxEntry {
    pub id: String,
    pub status: InboxStatus,
    pub scope: MemoryScope,
    pub scope_id: Option<String>,
    pub target_item_id: Option<String>,
    pub memory_type: Option<MemoryType>,
    pub title: Option<String>,
    pub confidence: Option<f64>,
    pub source_session_id: Option<String>,
    pub source_turn_start: Option<u64>,
    pub source_turn_end: Option<u64>,
    pub operation_id: Option<String>,
    pub base_hash: Option<String>,
    pub result_hash: Option<String>,
    pub reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl StoredInboxEntry {
    /// Projects a proposal payload into a fresh inbox row.
    #[must_use]
    pub fn from_proposal(proposal: &InboxProposal) -> Self {
        Self {
            id: proposal.entry_id.clone(),
            status: proposal.status,
            scope: proposal.scope,
            scope_id: proposal.scope_id.clone(),
            target_item_id: proposal.target_item_id.clone(),
            memory_type: proposal.memory_type,
            title: proposal.title.clone(),
            confidence: proposal.confidence,
            source_session_id: proposal.source_session_id.clone(),
            source_turn_start: proposal.source_turn_start,
            source_turn_end: proposal.source_turn_end,
            operation_id: proposal.operation_id.clone(),
            base_hash: proposal.base_hash.clone(),
            result_hash: proposal.result_hash.clone(),
            reason: proposal.reason.clone(),
            created_at: proposal.at_ms,
            updated_at: proposal.at_ms,
        }
    }
}

const INBOX_COLUMNS: &str = "id, status, scope, scope_id, target_item_id, memory_type, title, \
     confidence, source_session_id, source_turn_start, source_turn_end, operation_id, base_hash, \
     result_hash, reason, created_at, updated_at";

pub(super) fn upsert_inbox_on(conn: &Connection, entry: &StoredInboxEntry) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO memory_inbox_entries \
            (id, status, scope, scope_id, target_item_id, memory_type, title, confidence, \
             source_session_id, source_turn_start, source_turn_end, operation_id, base_hash, \
             result_hash, reason, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17) \
         ON CONFLICT(id) DO UPDATE SET \
            status = excluded.status, target_item_id = excluded.target_item_id, \
            memory_type = excluded.memory_type, title = excluded.title, \
            confidence = excluded.confidence, operation_id = excluded.operation_id, \
            base_hash = excluded.base_hash, result_hash = excluded.result_hash, \
            reason = excluded.reason, updated_at = excluded.updated_at",
        params![
            entry.id,
            entry.status.as_str(),
            entry.scope.as_str(),
            entry.scope_id.as_deref().unwrap_or(""),
            entry.target_item_id,
            entry.memory_type.map(MemoryType::as_str),
            entry.title,
            entry.confidence,
            entry.source_session_id,
            entry.source_turn_start.map(|seq| seq as i64),
            entry.source_turn_end.map(|seq| seq as i64),
            entry.operation_id,
            entry.base_hash,
            entry.result_hash,
            entry.reason,
            entry.created_at,
            entry.updated_at,
        ],
    )?;
    Ok(())
}

pub(super) fn set_inbox_status_on(
    conn: &Connection,
    entry_id: &str,
    status: InboxStatus,
    at_ms: i64,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE memory_inbox_entries SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![entry_id, status.as_str(), at_ms],
    )?;
    Ok(())
}

pub(super) fn upsert_cursor_on(
    conn: &Connection,
    session_id: &str,
    last_extracted_seq: i64,
    at_ms: i64,
) -> rusqlite::Result<()> {
    // Never move a cursor backward: replaying an older CursorAdvanced event must
    // not undo a later advance.
    conn.execute(
        "INSERT INTO memory_cursors (session_id, last_extracted_seq, updated_at) \
         VALUES (?1, ?2, ?3) \
         ON CONFLICT(session_id) DO UPDATE SET \
            last_extracted_seq = MAX(last_extracted_seq, excluded.last_extracted_seq), \
            updated_at = excluded.updated_at",
        params![session_id, last_extracted_seq, at_ms],
    )?;
    Ok(())
}

pub(super) fn upsert_correction_on(
    conn: &Connection,
    suppression_key: &str,
    scope: MemoryScope,
    scope_id: Option<&str>,
    reason: Option<&str>,
    at_ms: i64,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO memory_corrections (suppression_key, scope, scope_id, reason, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(suppression_key) DO UPDATE SET reason = excluded.reason",
        params![
            suppression_key,
            scope.as_str(),
            scope_id.unwrap_or(""),
            reason,
            at_ms
        ],
    )?;
    Ok(())
}

fn row_to_inbox(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredInboxEntry> {
    let status: String = row.get(1)?;
    let scope: String = row.get(2)?;
    let scope_id: String = row.get(3)?;
    let memory_type: Option<String> = row.get(5)?;
    let memory_type = match memory_type {
        Some(value) => Some(parse_or_err(MemoryType::parse(&value), "memory_type")?),
        None => None,
    };
    Ok(StoredInboxEntry {
        id: row.get(0)?,
        status: parse_or_err(InboxStatus::parse(&status), "status")?,
        scope: parse_or_err(MemoryScope::parse(&scope), "scope")?,
        scope_id: Some(scope_id).filter(|value| !value.is_empty()),
        target_item_id: row.get(4)?,
        memory_type,
        title: row.get(6)?,
        confidence: row.get(7)?,
        source_session_id: row.get(8)?,
        source_turn_start: row.get::<_, Option<i64>>(9)?.map(|seq| seq as u64),
        source_turn_end: row.get::<_, Option<i64>>(10)?.map(|seq| seq as u64),
        operation_id: row.get(11)?,
        base_hash: row.get(12)?,
        result_hash: row.get(13)?,
        reason: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

impl Store {
    /// Upserts one inbox entry projection row.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_inbox_entry(&self, entry: &StoredInboxEntry) -> rusqlite::Result<()> {
        upsert_inbox_on(&self.connect()?, entry)
    }

    /// Transitions an inbox entry to a new review status.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn set_inbox_status(
        &self,
        entry_id: &str,
        status: InboxStatus,
        at_ms: i64,
    ) -> rusqlite::Result<()> {
        set_inbox_status_on(&self.connect()?, entry_id, status, at_ms)
    }

    /// Reads one inbox entry by id.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn inbox_entry(&self, entry_id: &str) -> rusqlite::Result<Option<StoredInboxEntry>> {
        self.connect()?
            .query_row(
                &format!("SELECT {INBOX_COLUMNS} FROM memory_inbox_entries WHERE id = ?1"),
                params![entry_id],
                row_to_inbox,
            )
            .optional()
    }

    /// Lists inbox entries, optionally filtered by status, newest first.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or query failure.
    pub fn list_inbox_entries(
        &self,
        status: Option<InboxStatus>,
    ) -> rusqlite::Result<Vec<StoredInboxEntry>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {INBOX_COLUMNS} FROM memory_inbox_entries \
             WHERE (?1 IS NULL OR status = ?1) ORDER BY updated_at DESC, id ASC"
        ))?;
        stmt.query_map(params![status.map(InboxStatus::as_str)], row_to_inbox)?
            .collect()
    }

    /// Reads a session's extraction cursor (`last_extracted_seq`), or `None`.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn memory_cursor(&self, session_id: &str) -> rusqlite::Result<Option<i64>> {
        self.connect()?
            .query_row(
                "SELECT last_extracted_seq FROM memory_cursors WHERE session_id = ?1",
                params![session_id],
                |row| row.get(0),
            )
            .optional()
    }

    /// Advances a session's extraction cursor (never backward).
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_memory_cursor(
        &self,
        session_id: &str,
        last_extracted_seq: i64,
        at_ms: i64,
    ) -> rusqlite::Result<()> {
        upsert_cursor_on(&self.connect()?, session_id, last_extracted_seq, at_ms)
    }

    /// Records a correction suppression key (idempotent).
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_memory_correction(
        &self,
        suppression_key: &str,
        scope: MemoryScope,
        scope_id: Option<&str>,
        reason: Option<&str>,
        at_ms: i64,
    ) -> rusqlite::Result<()> {
        upsert_correction_on(
            &self.connect()?,
            suppression_key,
            scope,
            scope_id,
            reason,
            at_ms,
        )
    }

    /// Whether a correction suppression key exists.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn has_memory_correction(&self, suppression_key: &str) -> rusqlite::Result<bool> {
        self.connect()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM memory_corrections WHERE suppression_key = ?1)",
            params![suppression_key],
            |row| row.get::<_, i64>(0).map(|exists| exists != 0),
        )
    }
}
