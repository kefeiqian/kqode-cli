//! Durable session persistence for the backend conversation loop.
//!
//! The coordinator owns turn state and calls into this module to project
//! resumable-session metadata into SQLite while appending authoritative
//! session-log events for replay/reindex.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use super::TurnResult;
use super::session_log::{SessionLogEvent, append_event};
use super::transcript::{SettledKind, TranscriptTurn};
use crate::store::{Store, StoredSession};

const SESSIONS_DIRNAME: &str = "sessions";
const SESSION_LOG_EXTENSION: &str = "jsonl";

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Persistence behavior the coordinator can invoke while handling turn state.
pub trait ConversationPersistence: Send {
    /// Persists the currently accepted enqueue for the active draft/session.
    fn on_enqueue(&mut self, turn_id: &str, seq: u64, prompt: &str) -> Result<(), String>;
    /// Persists the terminal result for one turn.
    fn on_settle(&mut self, turn_id: &str, result: &TurnResult) -> Result<(), String>;
    /// Persists the clear/rollover of all unsettled turns before a fresh draft starts.
    fn on_clear(&mut self, turns: &[TranscriptTurn]) -> Result<(), String>;
    /// Returns the durable session currently attached to new submits, if any.
    fn current_session_id(&self) -> Option<String>;
    /// Attaches future submits to `session`.
    fn attach_session(&mut self, session: StoredSession);
}

/// No-op persistence used by tests or code paths that do not need durable state.
pub struct NoopConversationPersistence;

impl ConversationPersistence for NoopConversationPersistence {
    fn on_enqueue(&mut self, _turn_id: &str, _seq: u64, _prompt: &str) -> Result<(), String> {
        Ok(())
    }

    fn on_settle(&mut self, _turn_id: &str, _result: &TurnResult) -> Result<(), String> {
        Ok(())
    }

    fn on_clear(&mut self, _turns: &[TranscriptTurn]) -> Result<(), String> {
        Ok(())
    }

    fn current_session_id(&self) -> Option<String> {
        None
    }

    fn attach_session(&mut self, _session: StoredSession) {}
}

/// Durable persistence backed by SQLite metadata projection plus an append-only session log.
pub struct SessionPersistence {
    store: Store,
    sessions_root: PathBuf,
    workspace_cwd: String,
    canonical_workspace_cwd: String,
    current_session: Option<StoredSession>,
    turn_sessions: HashMap<String, StoredSession>,
}

impl SessionPersistence {
    /// Creates persistence rooted next to the SQLite store under `<home>/sessions/`.
    #[must_use]
    pub fn new(store: Store) -> Self {
        let sessions_root = store
            .path()
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join(SESSIONS_DIRNAME);
        let workspace_cwd = std::env::current_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_default();
        let canonical_workspace_cwd = std::env::current_dir()
            .and_then(std::fs::canonicalize)
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| workspace_cwd.clone());
        Self {
            store,
            sessions_root,
            workspace_cwd,
            canonical_workspace_cwd,
            current_session: None,
            turn_sessions: HashMap::new(),
        }
    }

    fn ensure_session(&mut self, prompt: &str) -> Result<&StoredSession, String> {
        if self.current_session.is_none() {
            let created_at = now_ms();
            let session_id = new_conversation_session_id();
            let session_log_path = self
                .sessions_root
                .join(format!("{session_id}.{SESSION_LOG_EXTENSION}"))
                .display()
                .to_string();
            let session = StoredSession {
                id: session_id.clone(),
                created_at,
                modified_at: created_at,
                workspace_cwd: self.workspace_cwd.clone(),
                canonical_workspace_cwd: self.canonical_workspace_cwd.clone(),
                session_log_path,
                first_prompt_summary: Some(summary_from_prompt(prompt)),
            };
            append_event(
                std::path::Path::new(&session.session_log_path),
                &SessionLogEvent::SessionStarted {
                    session_id,
                    created_at_ms: created_at,
                    workspace_cwd: session.workspace_cwd.clone(),
                    canonical_workspace_cwd: session.canonical_workspace_cwd.clone(),
                },
            )
            .map_err(|error| format!("could not append session-start event: {error}"))?;
            self.store
                .upsert_session(&session)
                .map_err(|error| format!("could not upsert session row: {error}"))?;
            self.current_session = Some(session);
        }
        Ok(self.current_session.as_ref().expect("session initialized"))
    }

    fn append_turn_settled(
        session: &StoredSession,
        turn_id: &str,
        result: &TurnResult,
    ) -> Result<(), String> {
        append_event(
            std::path::Path::new(&session.session_log_path),
            &SessionLogEvent::TurnSettled {
                turn_id: turn_id.to_owned(),
                settled_kind: settled_kind_name(result.kind).to_owned(),
                text: result.text.clone(),
                finish_reason: result.finish_reason.clone(),
                error_kind: result.error_kind.clone(),
                message: result.message.clone(),
                at_ms: now_ms(),
            },
        )
        .map_err(|error| format!("could not append turn-settled event: {error}"))
    }

    fn update_modified(&mut self) -> Result<(), String> {
        let Some(session) = self.current_session.as_mut() else {
            return Ok(());
        };
        session.modified_at = now_ms();
        self.store
            .upsert_session(session)
            .map_err(|error| format!("could not update session row: {error}"))
    }
}

impl ConversationPersistence for SessionPersistence {
    fn on_enqueue(&mut self, turn_id: &str, seq: u64, prompt: &str) -> Result<(), String> {
        let session = self.ensure_session(prompt)?.clone();
        append_event(
            std::path::Path::new(&session.session_log_path),
            &SessionLogEvent::TurnEnqueued {
                turn_id: turn_id.to_owned(),
                seq,
                prompt: prompt.to_owned(),
                at_ms: now_ms(),
            },
        )
        .map_err(|error| format!("could not append turn-enqueued event: {error}"))?;
        self.turn_sessions.insert(turn_id.to_owned(), session);
        self.update_modified()
    }

    fn on_settle(&mut self, turn_id: &str, result: &TurnResult) -> Result<(), String> {
        let Some(session) = self.turn_sessions.remove(turn_id) else {
            return Ok(());
        };
        Self::append_turn_settled(&session, turn_id, result)?;
        self.update_modified()
    }

    fn on_clear(&mut self, turns: &[TranscriptTurn]) -> Result<(), String> {
        let Some(session) = self.current_session.as_ref() else {
            return Ok(());
        };
        for turn in turns
            .iter()
            .filter(|turn| turn.state != super::transcript::TurnState::Settled)
        {
            Self::append_turn_settled(session, &turn.turn_id, &TurnResult::cancelled())?;
            self.turn_sessions.remove(&turn.turn_id);
        }
        self.current_session = None;
        Ok(())
    }

    fn current_session_id(&self) -> Option<String> {
        self.current_session
            .as_ref()
            .map(|session| session.id.clone())
    }

    fn attach_session(&mut self, session: StoredSession) {
        self.current_session = Some(session);
        self.turn_sessions.clear();
    }
}

fn new_conversation_session_id() -> String {
    let counter = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("conv-{}-{:x}-{}", now_ms(), std::process::id(), counter)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

fn settled_kind_name(kind: SettledKind) -> &'static str {
    match kind {
        SettledKind::Completed => "completed",
        SettledKind::NeedsConfiguration => "needsConfiguration",
        SettledKind::Error => "error",
        SettledKind::Cancelled => "cancelled",
    }
}

fn summary_from_prompt(prompt: &str) -> String {
    prompt.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use super::*;
    use crate::store::Store;
    use crate::test_env;

    struct CwdGuard {
        previous: std::path::PathBuf,
    }

    impl Drop for CwdGuard {
        fn drop(&mut self) {
            std::env::set_current_dir(&self.previous).expect("restore cwd");
        }
    }

    fn switch_to(path: &Path) -> CwdGuard {
        let previous = std::env::current_dir().expect("current dir");
        std::env::set_current_dir(path).expect("switch cwd");
        CwdGuard { previous }
    }

    fn read_log(path: &Path) -> Vec<SessionLogEvent> {
        let contents = fs::read_to_string(path).expect("session log");
        contents
            .lines()
            .map(|line| serde_json::from_str::<SessionLogEvent>(line).expect("valid log line"))
            .collect()
    }

    #[test]
    fn first_submit_creates_visible_session_and_log() {
        let _lock = test_env::lock();
        let dir = tempfile::tempdir().expect("temp dir");
        let workspace = dir.path().join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        let _cwd = switch_to(&workspace);
        let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).unwrap();
        let mut persistence = SessionPersistence::new(store.clone());

        persistence
            .on_enqueue("turn-a", 0, " first \n prompt ")
            .unwrap();
        persistence
            .on_settle("turn-a", &TurnResult::completed("done".to_owned(), None))
            .unwrap();

        let sessions = store.list_resumable_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(
            sessions[0].first_prompt_summary.as_deref(),
            Some("first prompt")
        );
        let events = read_log(Path::new(&sessions[0].session_log_path));
        assert!(matches!(events[0], SessionLogEvent::SessionStarted { .. }));
        assert!(matches!(
            events[1],
            SessionLogEvent::TurnEnqueued {
                ref turn_id,
                seq: 0,
                ref prompt,
                ..
            } if turn_id == "turn-a" && prompt == " first \n prompt "
        ));
        assert!(matches!(
            events[2],
            SessionLogEvent::TurnSettled {
                ref turn_id,
                ref settled_kind,
                ref text,
                ..
            } if turn_id == "turn-a" && settled_kind == "completed" && text.as_deref() == Some("done")
        ));
    }

    #[test]
    fn clear_rolls_over_to_new_hidden_draft_without_reusing_old_turn_logging() {
        let _lock = test_env::lock();
        let dir = tempfile::tempdir().expect("temp dir");
        let workspace = dir.path().join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        let _cwd = switch_to(&workspace);
        let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).unwrap();
        let mut persistence = SessionPersistence::new(store.clone());

        persistence.on_enqueue("turn-a", 0, "first").unwrap();
        persistence
            .on_clear(&[TranscriptTurn {
                turn_id: "turn-a".to_owned(),
                seq: 0,
                prompt: "first".to_owned(),
                state: super::super::transcript::TurnState::Active,
                result: None,
            }])
            .unwrap();
        persistence.on_enqueue("turn-b", 0, "second").unwrap();
        persistence
            .on_settle("turn-a", &TurnResult::completed("late".to_owned(), None))
            .unwrap();
        persistence
            .on_settle("turn-b", &TurnResult::completed("done".to_owned(), None))
            .unwrap();

        let sessions = store.list_resumable_sessions().unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(
            sessions
                .iter()
                .map(|session| session.first_prompt_summary.clone().unwrap())
                .collect::<Vec<_>>(),
            vec!["second".to_owned(), "first".to_owned()]
        );
        let first_events = read_log(Path::new(&sessions[1].session_log_path));
        assert_eq!(first_events.len(), 3);
        assert!(matches!(
            first_events[2],
            SessionLogEvent::TurnSettled {
                ref settled_kind,
                ..
            } if settled_kind == "cancelled"
        ));
    }
}
