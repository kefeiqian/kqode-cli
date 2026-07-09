use std::collections::HashMap;
use std::sync::mpsc;

use lsp_server::{Request, Response};

use crate::conversation::session_log::SessionLogEvent;
use crate::conversation::transcript::TranscriptTurn;
use crate::conversation::{Command, ConversationStatus, SettledKind, TurnResult, TurnState};
use crate::protocol::{
    JSON_RPC_INVALID_PARAMS, ResumedTurnWire, SESSION_STATUS_CURRENT, SESSION_STATUS_IDLE,
    SessionListResult, SessionResumeParams, SessionResumeResult, SessionSummaryWire,
    SessionTurnResultWire,
};
use crate::store::{Store, StoredSession};

pub(super) fn list_sessions(
    request: Request,
    store: &Store,
    coordinator: &std::sync::mpsc::Sender<Command>,
) -> Response {
    let status = current_status(coordinator);
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
    let status = current_status(coordinator);
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
    let turns = match restore_turns(&session) {
        Ok(turns) => turns,
        Err(error) => {
            return Response::new_err(
                request.id,
                JSON_RPC_INVALID_PARAMS,
                format!("could not restore session `{}`: {error}", params.session_id),
            );
        }
    };
    let (tx, rx) = mpsc::channel();
    let _ = coordinator.send(Command::ResumeSession {
        session: session.clone(),
        turns: turns.clone(),
        respond_to: tx,
    });
    let _ = rx.recv();
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

fn current_status(coordinator: &std::sync::mpsc::Sender<Command>) -> ConversationStatus {
    let (tx, rx) = mpsc::channel();
    let _ = coordinator.send(Command::QueryStatus { respond_to: tx });
    rx.recv().unwrap_or(ConversationStatus {
        current_session_id: None,
        has_unsettled_turns: false,
    })
}

fn restore_turns(session: &StoredSession) -> Result<Vec<TranscriptTurn>, String> {
    let contents = std::fs::read_to_string(&session.session_log_path)
        .map_err(|error| format!("could not read session log: {error}"))?;
    let mut turns = HashMap::<String, TranscriptTurn>::new();
    for line in contents.lines() {
        let event = serde_json::from_str::<SessionLogEvent>(line)
            .map_err(|error| format!("could not parse session log event: {error}"))?;
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
    Ok(turns)
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
