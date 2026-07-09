//! SQLite memory index: a rebuildable projection of file + event-log truth.
//!
//! `memory_items` projects the topic markdown files; the inbox, cursor, and
//! correction tables project `memory_events.jsonl`. [`Store::reindex_memory_from_files`]
//! rebuilds every projection atomically (a single transaction) so a deleted DB
//! recovers from files alone, and reconciles crash-interrupted file operations
//! from on-disk content hashes.

mod items;
mod lifecycle;

use std::collections::HashSet;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::memory::corpus;
use crate::memory::event_log::{self, MemoryEvent, MemoryOp};
use crate::store::Store;

pub use items::StoredMemoryItem;
pub use lifecycle::StoredInboxEntry;

const MEMORY_DIRNAME: &str = "memory";
const MEMORY_EVENTS_FILENAME: &str = "memory_events.jsonl";
const INDEX_FILENAME: &str = "MEMORY.md";
const TOPIC_EXTENSION: &str = "md";

impl Store {
    /// Rebuilds the entire memory index from topic files + the event log.
    ///
    /// Runs at bootstrap (like session reindex) and on explicit `/memory reload`.
    /// Item rows come from the topic files; inbox/cursor/correction rows come
    /// from replaying `memory_events.jsonl`. Crash-interrupted operations are
    /// reconciled against on-disk content first. The projection swap runs in one
    /// transaction so a partial rebuild never leaves a half-updated index.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection, transaction, or
    /// write failure. Missing files are treated as an empty corpus, not an error.
    pub(super) fn reindex_memory_from_files(&self) -> rusqlite::Result<()> {
        let Some(memory_root) = self.path().parent().map(|dir| dir.join(MEMORY_DIRNAME)) else {
            return Ok(());
        };
        let event_log_path = memory_root.join(MEMORY_EVENTS_FILENAME);

        let items = scan_topic_items(&memory_root);
        let events = event_log::read_events(&event_log_path);
        reconcile_pending_operations(&event_log_path, &events, &items);

        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        for table in [
            "memory_items",
            "memory_inbox_entries",
            "memory_cursors",
            "memory_corrections",
        ] {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }
        for item in &items {
            items::upsert_item_on(&tx, item)?;
        }
        for event in &events {
            project_event(&tx, event)?;
        }
        tx.commit()
    }
}

/// Projects one lifecycle event into the inbox/cursor/correction tables.
/// Operation events drive crash reconciliation, not row state, so they no-op here.
fn project_event(conn: &Connection, event: &MemoryEvent) -> rusqlite::Result<()> {
    match event {
        MemoryEvent::InboxProposed { data } => {
            lifecycle::upsert_inbox_on(conn, &StoredInboxEntry::from_proposal(data))
        }
        MemoryEvent::InboxReviewed {
            entry_id,
            status,
            at_ms,
            ..
        } => lifecycle::set_inbox_status_on(conn, entry_id, *status, *at_ms),
        MemoryEvent::CorrectionRecorded {
            suppression_key,
            scope,
            scope_id,
            reason,
            at_ms,
        } => lifecycle::upsert_correction_on(
            conn,
            suppression_key,
            *scope,
            scope_id.as_deref(),
            reason.as_deref(),
            *at_ms,
        ),
        MemoryEvent::CursorAdvanced {
            session_id,
            last_extracted_seq,
            at_ms,
        } => lifecycle::upsert_cursor_on(conn, session_id, *last_extracted_seq, *at_ms),
        MemoryEvent::OperationStarted { .. }
        | MemoryEvent::OperationApplied { .. }
        | MemoryEvent::OperationFailed { .. } => Ok(()),
    }
}

/// Resolves crash-interrupted file operations by comparing the recorded intent
/// against the item now on disk, appending a durable terminal event so the next
/// reindex sees the operation as settled (idempotent).
fn reconcile_pending_operations(log: &Path, events: &[MemoryEvent], items: &[StoredMemoryItem]) {
    let mut resolved: HashSet<&str> = HashSet::new();
    for event in events {
        match event {
            MemoryEvent::OperationApplied { operation_id, .. }
            | MemoryEvent::OperationFailed { operation_id, .. } => {
                resolved.insert(operation_id.as_str());
            }
            _ => {}
        }
    }
    for event in events {
        let MemoryEvent::OperationStarted {
            operation_id,
            item_id,
            scope,
            scope_id,
            op,
            result_hash,
            ..
        } = event
        else {
            continue;
        };
        if resolved.contains(operation_id.as_str()) {
            continue;
        }
        let terminal = if operation_landed(
            *op,
            item_id,
            scope_id.as_deref(),
            result_hash,
            items,
            *scope,
        ) {
            MemoryEvent::OperationApplied {
                operation_id: operation_id.clone(),
                at_ms: now_ms(),
            }
        } else {
            MemoryEvent::OperationFailed {
                operation_id: operation_id.clone(),
                reason: Some(
                    "reconciled: on-disk state did not match the recorded intent".to_owned(),
                ),
                at_ms: now_ms(),
            }
        };
        let _ = event_log::append_event(log, &terminal);
    }
}

/// Whether the recorded operation's expected on-disk result is present now.
fn operation_landed(
    op: MemoryOp,
    item_id: &str,
    scope_id: Option<&str>,
    result_hash: &Option<String>,
    items: &[StoredMemoryItem],
    scope: crate::memory::MemoryScope,
) -> bool {
    let found = items.iter().find(|item| {
        item.id == item_id && item.scope == scope && item.scope_id.as_deref() == scope_id
    });
    match op {
        MemoryOp::Write => {
            found.is_some_and(|item| Some(&item.content_hash) == result_hash.as_ref())
        }
        MemoryOp::Forget => found.is_none(),
    }
}

/// Recursively parses every topic file under `root` (skipping `MEMORY.md`).
/// Invalid files are skipped, not fatal, so one bad file cannot block reindex.
fn scan_topic_items(root: &Path) -> Vec<StoredMemoryItem> {
    let mut items = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.file_name().and_then(|name| name.to_str()) == Some(INDEX_FILENAME) {
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some(TOPIC_EXTENSION) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            if let Ok(item) = corpus::parse_item(&text) {
                items.push(StoredMemoryItem::from_item(
                    item,
                    path.display().to_string(),
                ));
            }
        }
    }
    items
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

/// Maps a required-but-unparseable enum column to a typed rusqlite error rather
/// than panicking, keeping the store fail-soft on a corrupt projection row.
pub(super) fn parse_or_err<T>(value: Option<T>, column: &str) -> rusqlite::Result<T> {
    value.ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(0, column.to_owned(), rusqlite::types::Type::Text)
    })
}
