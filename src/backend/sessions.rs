use std::collections::HashMap;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::Duration;

use lsp_server::{Request, Response};

use crate::chat::CompactionState;
use crate::conversation::session_log::{SessionLogEvent, parse_jsonl_prefix};
use crate::conversation::transcript::TranscriptTurn;
use crate::conversation::{Command, ConversationStatus, SettledKind, TurnResult, TurnState};
use crate::protocol::{
    JSON_RPC_INVALID_PARAMS, ResumedTurnWire, SESSION_STATUS_CURRENT, SESSION_STATUS_IDLE,
    SessionListResult, SessionResumeParams, SessionResumeResult, SessionSummaryWire,
    SessionTurnResultWire,
};
use crate::store::{Store, StoredSession};

const COORDINATOR_REPLY_TIMEOUT: Duration = Duration::from_millis(250);

pub(super) fn list_sessions(
    request: Request,
    store: &Store,
    coordinator: &std::sync::mpsc::Sender<Command>,
) -> Response {
    let status = match current_status(coordinator) {
        Ok(status) => status,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("could not read session status: {error}"),
            );
        }
    };
    let sessions = match store.list_resumable_sessions() {
        Ok(sessions) => sessions,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("could not list sessions: {error}"),
            );
        }
    };
    Response::new_ok(
        request.id,
        SessionListResult {
            sessions: sessions
                .into_iter()
                .map(|session| SessionSummaryWire {
                    session_id: session.id.clone(),
                    summary: session.first_prompt_summary.unwrap_or_default(),
                    status: if status.current_session_id.as_deref() == Some(session.id.as_str()) {
                        SESSION_STATUS_CURRENT
                    } else {
                        SESSION_STATUS_IDLE
                    },
                    modified_at: session.modified_at,
                    created_at: session.created_at,
                    folder: session.workspace_cwd,
                })
                .collect(),
        },
    )
}

pub(super) fn resume_session(
    request: Request,
    store: &Store,
    coordinator: &std::sync::mpsc::Sender<Command>,
) -> Response {
    let params = match serde_json::from_value::<SessionResumeParams>(request.params) {
        Ok(params) => params,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("invalid session resume params: {error}"),
            );
        }
    };
    let status = match current_status(coordinator) {
        Ok(status) => status,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("could not read session status: {error}"),
            );
        }
    };
    if status.has_unsettled_turns {
        return Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            "cannot resume a different session while a turn is active or pending".to_owned(),
        );
    }
    let Some(session) = store.session(&params.session_id).ok().flatten() else {
        return Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            format!("unknown session `{}`", params.session_id),
        );
    };
    if let Err(error) = validate_current_workspace(&session) {
        return Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            format!("cannot resume session `{}`: {error}", params.session_id),
        );
    }
    let (turns, compaction) = match restore_turns(&session) {
        Ok(restored) => restored,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("could not restore session `{}`: {error}", params.session_id),
            );
        }
    };
    let (tx, rx) = mpsc::channel();
    if coordinator
        .send(Command::ResumeSession {
            session: session.clone(),
            turns: turns.clone(),
            compaction,
            respond_to: tx,
        })
        .is_err()
    {
        return Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            "could not attach session: conversation coordinator is unavailable".to_owned(),
        );
    }
    if let Err(error) = wait_for_coordinator_ack(rx) {
        return Response::new_err(
            request.id,
            JSON_RPC_INVALID_PARAMS,
            format!("could not attach session: {error}"),
        );
    }
    Response::new_ok(
        request.id,
        SessionResumeResult {
            session_id: session.id,
            workspace_cwd: session.workspace_cwd,
            canonical_workspace_cwd: session.canonical_workspace_cwd,
            turns: turns.into_iter().map(to_resumed_turn).collect(),
        },
    )
}

fn validate_current_workspace(session: &StoredSession) -> Result<(), String> {
    if session.canonical_workspace_cwd.trim().is_empty() {
        return Ok(());
    }
    let current = std::env::current_dir()
        .and_then(std::fs::canonicalize)
        .map_err(|error| format!("could not canonicalize current workspace: {error}"))?
        .display()
        .to_string();
    if current == session.canonical_workspace_cwd {
        Ok(())
    } else {
        Err(format!(
            "stored canonical workspace `{}` does not match current workspace `{current}`",
            session.canonical_workspace_cwd
        ))
    }
}

fn current_status(
    coordinator: &std::sync::mpsc::Sender<Command>,
) -> Result<ConversationStatus, String> {
    let (tx, rx) = mpsc::channel();
    coordinator
        .send(Command::QueryStatus { respond_to: tx })
        .map_err(|_| "conversation coordinator is unavailable".to_owned())?;
    rx.recv_timeout(COORDINATOR_REPLY_TIMEOUT)
        .map_err(coordinator_wait_error)
}

fn wait_for_coordinator_ack(rx: mpsc::Receiver<()>) -> Result<(), String> {
    rx.recv_timeout(COORDINATOR_REPLY_TIMEOUT)
        .map_err(coordinator_wait_error)
}

fn coordinator_wait_error(error: RecvTimeoutError) -> String {
    match error {
        RecvTimeoutError::Timeout => "timed out waiting for conversation coordinator".to_owned(),
        RecvTimeoutError::Disconnected => {
            "conversation coordinator stopped before replying".to_owned()
        }
    }
}

fn restore_turns(
    session: &StoredSession,
) -> Result<(Vec<TranscriptTurn>, CompactionState), String> {
    let contents = std::fs::read_to_string(&session.session_log_path)
        .map_err(|error| format!("could not read session log: {error}"))?;
    let mut turns = HashMap::<String, TranscriptTurn>::new();
    let mut compaction = CompactionState::default();
    for event in parse_jsonl_prefix::<SessionLogEvent>(&contents)
        .map_err(|error| format!("could not parse session log event: {error}"))?
    {
        match event {
            SessionLogEvent::SessionStarted { .. } => {}
            SessionLogEvent::TurnEnqueued {
                turn_id,
                seq,
                prompt,
                ..
            } => {
                turns.insert(
                    turn_id.clone(),
                    TranscriptTurn {
                        turn_id,
                        seq,
                        prompt,
                        state: TurnState::Pending,
                        result: None,
                    },
                );
            }
            SessionLogEvent::TurnSettled {
                turn_id,
                settled_kind,
                text,
                finish_reason,
                error_kind,
                message,
                ..
            } => {
                let Some(turn) = turns.get_mut(&turn_id) else {
                    continue;
                };
                turn.state = TurnState::Settled;
                turn.result = Some(match settled_kind.as_str() {
                    "completed" => TurnResult::completed(text.unwrap_or_default(), finish_reason),
                    "needsConfiguration" => {
                        TurnResult::needs_configuration(message.unwrap_or_default())
                    }
                    "cancelled" => TurnResult::cancelled(),
                    _ => TurnResult::error(
                        error_kind.unwrap_or_else(|| "error".to_owned()),
                        message.unwrap_or_else(|| "turn failed".to_owned()),
                    ),
                });
            }
            SessionLogEvent::Compacted {
                covered_through_seq,
                summary,
                ..
            } => {
                compaction = CompactionState {
                    summary: Some(summary),
                    covered_through_seq,
                };
            }
            // Metadata-only event; it does not affect restored turns.
            SessionLogEvent::SummaryGenerated { .. } => {}
        }
    }
    let mut turns: Vec<_> = turns
        .into_values()
        .map(|mut turn| {
            if turn.result.is_none() {
                turn.state = TurnState::Settled;
                turn.result = Some(TurnResult::error(
                    "interrupted",
                    "turn interrupted before resume",
                ));
            }
            turn
        })
        .collect();
    turns.sort_by_key(|turn| turn.seq);
    Ok((turns, compaction))
}

fn to_resumed_turn(turn: TranscriptTurn) -> ResumedTurnWire {
    let result = turn.result.expect("restored turns always settle");
    ResumedTurnWire {
        turn_id: turn.turn_id,
        seq: turn.seq,
        prompt: turn.prompt,
        result: match result.kind {
            SettledKind::Completed => {
                SessionTurnResultWire::completed(result.text, result.finish_reason)
            }
            SettledKind::NeedsConfiguration => {
                SessionTurnResultWire::needs_configuration(result.message)
            }
            SettledKind::Error => SessionTurnResultWire::error(result.error_kind, result.message),
            SettledKind::Cancelled => SessionTurnResultWire::cancelled(),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    fn started() -> SessionLogEvent {
        SessionLogEvent::SessionStarted {
            session_id: "sess".to_owned(),
            created_at_ms: 0,
            workspace_cwd: "w".to_owned(),
            canonical_workspace_cwd: "w".to_owned(),
        }
    }

    fn settled(turn_id: &str, seq: u64, text: &str, at_ms: i64) -> [SessionLogEvent; 2] {
        [
            SessionLogEvent::TurnEnqueued {
                turn_id: turn_id.to_owned(),
                seq,
                prompt: format!("prompt {seq}"),
                at_ms,
            },
            SessionLogEvent::TurnSettled {
                turn_id: turn_id.to_owned(),
                settled_kind: "completed".to_owned(),
                text: Some(text.to_owned()),
                finish_reason: None,
                error_kind: None,
                message: None,
                at_ms: at_ms + 1,
            },
        ]
    }

    fn compacted(covered_through_seq: u64, summary: &str, at_ms: i64) -> SessionLogEvent {
        SessionLogEvent::Compacted {
            covered_through_seq,
            summary: summary.to_owned(),
            at_ms,
        }
    }

    /// Writes real serialized events (so the on-disk format is exact, not guessed)
    /// and returns a `StoredSession` pointing at them.
    fn session_with_events(dir: &std::path::Path, events: &[SessionLogEvent]) -> StoredSession {
        let path = dir.join("sess.jsonl");
        let mut file = std::fs::File::create(&path).expect("create log");
        for event in events {
            let line = serde_json::to_string(event).expect("serialize event");
            writeln!(file, "{line}").expect("write log line");
        }
        StoredSession {
            id: "sess".to_owned(),
            created_at: 0,
            modified_at: 0,
            workspace_cwd: dir.display().to_string(),
            canonical_workspace_cwd: dir.display().to_string(),
            session_log_path: path.display().to_string(),
            first_prompt_summary: Some("first".to_owned()),
        }
    }

    #[test]
    fn restore_turns_keeps_all_turns_and_takes_the_latest_compaction() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut events = vec![started()];
        events.extend(settled("t0", 0, "a0", 1));
        events.push(compacted(0, "OLD", 3));
        events.extend(settled("t1", 1, "a1", 4));
        events.push(compacted(1, "LATEST", 6));
        let session = session_with_events(dir.path(), &events);

        let (turns, compaction) = restore_turns(&session).expect("restore");

        // Every real turn is restored for display (R3), regardless of compaction.
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].seq, 0);
        assert_eq!(turns[1].seq, 1);
        // The latest Compacted event wins and is restored for prompt assembly (R15/AE6).
        assert_eq!(compaction.summary.as_deref(), Some("LATEST"));
        assert_eq!(compaction.covered_through_seq, 1);
    }

    #[test]
    fn restore_turns_without_compaction_yields_empty_state() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut events = vec![started()];
        events.extend(settled("t0", 0, "a0", 1));
        let session = session_with_events(dir.path(), &events);

        let (turns, compaction) = restore_turns(&session).expect("restore");
        assert_eq!(turns.len(), 1);
        assert_eq!(compaction, CompactionState::default());
    }

    #[test]
    fn restore_turns_ignores_summary_generated_event() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut events = vec![started()];
        events.extend(settled("t0", 0, "a0", 1));
        events.push(SessionLogEvent::SummaryGenerated {
            summary: "Fix the parser bug".to_owned(),
            at_ms: 5,
        });
        let session = session_with_events(dir.path(), &events);

        let (turns, compaction) = restore_turns(&session).expect("restore");
        assert_eq!(turns.len(), 1);
        assert_eq!(compaction, CompactionState::default());
    }

    #[test]
    fn restore_turns_tolerates_truncated_tail() {
        let dir = tempfile::tempdir().expect("temp dir");
        let session = session_with_events(
            dir.path(),
            &[started(), settled("t0", 0, "a0", 1)[0].clone()],
        );
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&session.session_log_path)
            .unwrap();
        write!(file, "{{\"kind\"").unwrap();

        let (turns, compaction) = restore_turns(&session).expect("restore");

        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].seq, 0);
        assert_eq!(turns[0].result.as_ref().unwrap().kind, SettledKind::Error);
        assert_eq!(compaction, CompactionState::default());
    }
}
