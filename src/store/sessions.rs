//! Stored local session metadata used to list and reload resumable sessions.
//!
//! SQLite remains a queryable index over the durable session-log truth. The
//! session rows here project the metadata the TUI and backend need to locate a
//! session, decide whether it is visible in `/resume`, and sort rows by recent
//! activity.

use rusqlite::{OptionalExtension, params};

use super::Store;
use super::recovery::sidecar_path;

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum SessionLogEventWire {
    SessionStarted {
        session_id: String,
        created_at_ms: i64,
        workspace_cwd: String,
        canonical_workspace_cwd: String,
    },
    TurnEnqueued {
        prompt: String,
        at_ms: i64,
    },
    TurnSettled {
        at_ms: i64,
    },
}

/// Queryable metadata for one durable local session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredSession {
    /// Stable durable session identity used in backend/TUI contracts.
    pub id: String,
    /// Epoch-millis of the first accepted submit for this session.
    pub created_at: i64,
    /// Epoch-millis of the latest projected durable activity.
    pub modified_at: i64,
    /// Original workspace cwd shown in the resume table.
    pub workspace_cwd: String,
    /// Canonicalized workspace path used to validate resume targets.
    pub canonical_workspace_cwd: String,
    /// Append-only session-log path used as replay truth.
    pub session_log_path: String,
    /// Temporary v1 summary derived from the first submitted prompt.
    pub first_prompt_summary: Option<String>,
}

impl Store {
    /// Inserts or updates one durable session row, preserving `created_at`.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or write failure.
    pub fn upsert_session(&self, session: &StoredSession) -> rusqlite::Result<()> {
        self.connect()?.execute(
            "INSERT INTO sessions \
                (id, created_at, workspace_cwd, jsonl_path, modified_at, canonical_workspace_cwd, first_prompt_summary) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(id) DO UPDATE SET \
                workspace_cwd = excluded.workspace_cwd, \
                jsonl_path = excluded.jsonl_path, \
                modified_at = excluded.modified_at, \
                canonical_workspace_cwd = excluded.canonical_workspace_cwd, \
                first_prompt_summary = excluded.first_prompt_summary",
            params![
                session.id,
                session.created_at,
                session.workspace_cwd,
                session.session_log_path,
                session.modified_at,
                session.canonical_workspace_cwd,
                session.first_prompt_summary,
            ],
        )?;
        Ok(())
    }

    /// Reads one durable session row by stable session id.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or read failure.
    pub fn session(&self, session_id: &str) -> rusqlite::Result<Option<StoredSession>> {
        self.connect()?
            .query_row(
                "SELECT created_at, modified_at, workspace_cwd, canonical_workspace_cwd, jsonl_path, first_prompt_summary \
                 FROM sessions WHERE id = ?1",
                [session_id],
                |row| {
                    Ok(StoredSession {
                        id: session_id.to_owned(),
                        created_at: row.get(0)?,
                        modified_at: row.get(1)?,
                        workspace_cwd: row.get(2)?,
                        canonical_workspace_cwd: row.get(3)?,
                        session_log_path: row.get(4)?,
                        first_prompt_summary: row.get(5)?,
                    })
                },
            )
            .optional()
    }

    /// Lists only visible resumable sessions, newest first.
    ///
    /// Sessions remain hidden until `first_prompt_summary` is populated by the
    /// first accepted submit, which matches the `/resume` requirement to omit
    /// empty draft sessions.
    ///
    /// # Errors
    /// Returns the underlying [`rusqlite::Error`] on connection or query failure.
    pub fn list_resumable_sessions(&self) -> rusqlite::Result<Vec<StoredSession>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, created_at, modified_at, workspace_cwd, canonical_workspace_cwd, jsonl_path, first_prompt_summary \
             FROM sessions \
             WHERE first_prompt_summary IS NOT NULL \
             ORDER BY modified_at DESC, created_at DESC, id DESC",
        )?;
        stmt.query_map([], |row| {
            Ok(StoredSession {
                id: row.get(0)?,
                created_at: row.get(1)?,
                modified_at: row.get(2)?,
                workspace_cwd: row.get(3)?,
                canonical_workspace_cwd: row.get(4)?,
                session_log_path: row.get(5)?,
                first_prompt_summary: row.get(6)?,
            })
        })?
        .collect()
    }

    pub(super) fn reindex_sessions_from_logs(&self) -> rusqlite::Result<()> {
        let Some(sessions_root) = self.path().parent().map(|path| path.join("sessions")) else {
            return Ok(());
        };
        let Ok(entries) = std::fs::read_dir(&sessions_root) else {
            return Ok(());
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                continue;
            }
            if let Some(session) = parse_session_log(&path) {
                self.upsert_session(&session)?;
            }
        }
        Ok(())
    }
}

fn parse_session_log(path: &std::path::Path) -> Option<StoredSession> {
    let contents = std::fs::read_to_string(path).ok()?;
    let mut id = None;
    let mut created_at = None;
    let mut workspace_cwd = None;
    let mut canonical_workspace_cwd = None;
    let mut modified_at = None;
    let mut first_prompt_summary = None;
    for line in contents.lines() {
        let event = serde_json::from_str::<SessionLogEventWire>(line).ok()?;
        match event {
            SessionLogEventWire::SessionStarted {
                session_id,
                created_at_ms,
                workspace_cwd: started_workspace_cwd,
                canonical_workspace_cwd: started_canonical_workspace_cwd,
            } => {
                id = Some(session_id);
                created_at = Some(created_at_ms);
                workspace_cwd = Some(started_workspace_cwd);
                canonical_workspace_cwd = Some(started_canonical_workspace_cwd);
                modified_at = Some(created_at_ms);
            }
            SessionLogEventWire::TurnEnqueued { prompt, at_ms } => {
                modified_at = Some(at_ms);
                if first_prompt_summary.is_none() {
                    first_prompt_summary = Some(prompt.split_whitespace().collect::<Vec<_>>().join(" "));
                }
            }
            SessionLogEventWire::TurnSettled { at_ms } => {
                modified_at = Some(at_ms);
            }
        }
    }
    Some(StoredSession {
        id: id?,
        created_at: created_at?,
        modified_at: modified_at.unwrap_or(created_at?),
        workspace_cwd: workspace_cwd?,
        canonical_workspace_cwd: canonical_workspace_cwd?,
        session_log_path: sidecar_path(path, "").display().to_string(),
        first_prompt_summary,
    })
}
