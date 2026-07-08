//! Append-only durable session-log truth for resumable conversations.
//!
//! The log stores one JSON object per line so later resume/reindex code can
//! rebuild session state without treating SQLite as the only source of truth.

use std::fs::{OpenOptions, create_dir_all};
use std::io::{BufWriter, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

/// One append-only durable session-log event.
#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SessionLogEvent {
    SessionStarted {
        session_id: String,
        created_at_ms: i64,
        workspace_cwd: String,
        canonical_workspace_cwd: String,
    },
    TurnEnqueued {
        turn_id: String,
        seq: u64,
        prompt: String,
        at_ms: i64,
    },
    TurnSettled {
        turn_id: String,
        settled_kind: String,
        text: Option<String>,
        finish_reason: Option<String>,
        error_kind: Option<String>,
        message: Option<String>,
        at_ms: i64,
    },
}

/// Appends one durable event to `path`, creating the parent directory first.
///
/// # Errors
/// Returns an error when the directory cannot be created, the file cannot be
/// opened, or the JSON line cannot be written.
pub fn append_event(path: &Path, event: &SessionLogEvent) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent)?;
    }
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    let mut writer = BufWriter::new(file);
    serde_json::to_writer(&mut writer, event)?;
    writer.write_all(b"\n")?;
    writer.flush()
}
