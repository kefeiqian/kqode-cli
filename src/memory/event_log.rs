//! Append-only `memory_events.jsonl` lifecycle truth (KTD2).
//!
//! Topic files are the truth for remembered *facts*; this log is the truth for
//! *lifecycle* state — operation intents, inbox proposals/reviews, correction
//! suppression, and extraction-cursor advances. SQLite projects this log, so the
//! index can always be rebuilt by replaying it. One global log lives under the
//! top-level memory root; a bad (e.g. crash-truncated) trailing line is skipped
//! rather than discarding the whole history.

use std::fs::{OpenOptions, create_dir_all};
use std::io::{BufWriter, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::model::{MemoryScope, MemoryType};

/// The mutation kind an operation intent describes.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryOp {
    /// Create or update an item's topic file.
    Write,
    /// Remove/deactivate an item.
    Forget,
}

/// Lifecycle status of an inbox entry.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InboxStatus {
    /// An inactive candidate awaiting review.
    Candidate,
    /// An automatic active update, applied but audited for review.
    ActiveAudit,
    /// Reviewer approved the entry.
    Approved,
    /// Reviewer rejected the entry.
    Rejected,
    /// Marked stale (superseded / no longer relevant).
    Stale,
    /// An applied automatic update that was undone.
    Undone,
    /// The entry's operation failed.
    Failed,
}

impl InboxStatus {
    /// The stable lowercase string form used in SQLite projections.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Candidate => "candidate",
            Self::ActiveAudit => "active_audit",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Stale => "stale",
            Self::Undone => "undone",
            Self::Failed => "failed",
        }
    }

    /// Parses the string form back into a status, or `None` if unrecognized.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "candidate" => Some(Self::Candidate),
            "active_audit" => Some(Self::ActiveAudit),
            "approved" => Some(Self::Approved),
            "rejected" => Some(Self::Rejected),
            "stale" => Some(Self::Stale),
            "undone" => Some(Self::Undone),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }
}

/// Full payload of an inbox proposal, shared by the event and the SQLite row.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct InboxProposal {
    pub entry_id: String,
    pub status: InboxStatus,
    pub scope: MemoryScope,
    #[serde(default)]
    pub scope_id: Option<String>,
    #[serde(default)]
    pub target_item_id: Option<String>,
    #[serde(default)]
    pub memory_type: Option<MemoryType>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub source_session_id: Option<String>,
    #[serde(default)]
    pub source_turn_start: Option<u64>,
    #[serde(default)]
    pub source_turn_end: Option<u64>,
    #[serde(default)]
    pub operation_id: Option<String>,
    #[serde(default)]
    pub base_hash: Option<String>,
    #[serde(default)]
    pub result_hash: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    pub at_ms: i64,
}

/// A single loaded memory item recorded in a [`MemoryEvent::MemoryLoaded`]
/// trace — identity + hash only, never the raw body (R12/R18).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct LoadedFragment {
    pub id: String,
    pub scope: MemoryScope,
    pub memory_type: MemoryType,
    pub content_hash: String,
    pub updated_at_ms: i64,
}

/// One append-only memory lifecycle event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MemoryEvent {
    /// A file mutation intent recorded before the atomic write (crash recovery).
    OperationStarted {
        operation_id: String,
        item_id: String,
        scope: MemoryScope,
        #[serde(default)]
        scope_id: Option<String>,
        op: MemoryOp,
        #[serde(default)]
        base_hash: Option<String>,
        #[serde(default)]
        result_hash: Option<String>,
        at_ms: i64,
    },
    /// The intent's atomic write completed.
    OperationApplied { operation_id: String, at_ms: i64 },
    /// The intent failed or was abandoned.
    OperationFailed {
        operation_id: String,
        #[serde(default)]
        reason: Option<String>,
        at_ms: i64,
    },
    /// An inbox entry was proposed (candidate or applied active-audit).
    InboxProposed { data: InboxProposal },
    /// An inbox entry transitioned to a new review status.
    InboxReviewed {
        entry_id: String,
        status: InboxStatus,
        #[serde(default)]
        reason: Option<String>,
        at_ms: i64,
    },
    /// A pre-mutation snapshot of an item's content, enabling undo/rollback of a
    /// later operation without SQLite ever holding the raw body.
    RollbackPoint {
        operation_id: String,
        item_id: String,
        scope: MemoryScope,
        #[serde(default)]
        scope_id: Option<String>,
        memory_type: MemoryType,
        title: String,
        body: String,
        active: bool,
        at_ms: i64,
    },
    /// A correction suppression key was recorded (never raw content).
    CorrectionRecorded {
        suppression_key: String,
        scope: MemoryScope,
        #[serde(default)]
        scope_id: Option<String>,
        #[serde(default)]
        reason: Option<String>,
        at_ms: i64,
    },
    /// The full proposed body for an inbox entry (event-log truth only, never
    /// projected into the SQLite index, R18), so a candidate can be activated
    /// into an item on approval without storing the body in the index.
    ProposalBody {
        entry_id: String,
        body: String,
        at_ms: i64,
    },
    /// A session's extraction cursor advanced.
    CursorAdvanced {
        session_id: String,
        last_extracted_seq: i64,
        at_ms: i64,
    },
    /// Bounded memory context was loaded into a prompt (trace only, no bodies).
    MemoryLoaded {
        fragments: Vec<LoadedFragment>,
        reason: String,
        at_ms: i64,
    },
    /// A content-free tombstone marking that an item's sensitive content was
    /// purged (its rollback/proposal bodies were redacted from this log).
    SensitivePurged { item_id: String, at_ms: i64 },
}

/// Appends one lifecycle event to `path`, creating the parent directory first.
///
/// # Errors
/// Returns an [`std::io::Error`] when the directory cannot be created, the file
/// cannot be opened, or the JSON line cannot be written.
pub fn append_event(path: &Path, event: &MemoryEvent) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent)?;
    }
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer(&mut writer, event)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

/// Reads all parseable lifecycle events from `path`, in file order.
///
/// A missing file yields an empty list. Unparseable lines (e.g. a crash-truncated
/// trailing line) are skipped so one bad line cannot discard the whole log.
#[must_use]
pub fn read_events(path: &Path) -> Vec<MemoryEvent> {
    let Ok(contents) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    contents
        .lines()
        .filter_map(|line| serde_json::from_str::<MemoryEvent>(line).ok())
        .collect()
}

/// Atomically rewrites the log with exactly `events`, replacing the file.
///
/// Used by sensitive purge to redact bodies from the otherwise append-only
/// truth. A single-user local tool; a concurrent append during the rewrite
/// could be lost, which is acceptable for the rebuildable index.
///
/// # Errors
/// Returns an [`std::io::Error`] on directory/file/rename failure.
pub fn rewrite_events(path: &Path, events: &[MemoryEvent]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent)?;
    }
    let tmp = path.with_extension("jsonl.tmp");
    {
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp)?;
        let mut writer = BufWriter::new(file);
        for event in events {
            serde_json::to_writer(&mut writer, event)?;
            writer.write_all(b"\n")?;
        }
        writer.flush()?;
    }
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_round_trip_through_the_log() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("memory_events.jsonl");
        let events = [
            MemoryEvent::CursorAdvanced {
                session_id: "conv-1".to_owned(),
                last_extracted_seq: 3,
                at_ms: 10,
            },
            MemoryEvent::CorrectionRecorded {
                suppression_key: "abc".to_owned(),
                scope: MemoryScope::Repo,
                scope_id: Some("rid".to_owned()),
                reason: Some("rejected".to_owned()),
                at_ms: 20,
            },
        ];
        for event in &events {
            append_event(&path, event).unwrap();
        }
        assert_eq!(read_events(&path), events);
    }

    #[test]
    fn read_skips_a_crash_truncated_trailing_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("memory_events.jsonl");
        append_event(
            &path,
            &MemoryEvent::OperationApplied {
                operation_id: "op-1".to_owned(),
                at_ms: 1,
            },
        )
        .unwrap();
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"{ partial truncated line")
            .unwrap();

        let events = read_events(&path);
        assert_eq!(events.len(), 1, "the partial line is skipped, not fatal");
    }

    #[test]
    fn inbox_proposal_serializes_under_a_data_field() {
        let event = MemoryEvent::InboxProposed {
            data: InboxProposal {
                entry_id: "e1".to_owned(),
                status: InboxStatus::Candidate,
                scope: MemoryScope::User,
                scope_id: None,
                target_item_id: None,
                memory_type: Some(MemoryType::User),
                title: Some("prefers tabs".to_owned()),
                confidence: Some(0.4),
                source_session_id: Some("conv-1".to_owned()),
                source_turn_start: Some(0),
                source_turn_end: Some(1),
                operation_id: None,
                base_hash: None,
                result_hash: None,
                reason: None,
                at_ms: 5,
            },
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"inboxProposed\""));
        assert_eq!(serde_json::from_str::<MemoryEvent>(&json).unwrap(), event);
    }
}
