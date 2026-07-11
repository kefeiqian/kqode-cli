//! In-memory conversation queue and transcript ownership.
//!
//! The coordinator is the single writer for turn state. It emits transport-free
//! domain events that the backend maps to JSON-RPC notifications.

pub mod coordinator;
mod persistence;
pub mod session_log;
mod state;
pub mod transcript;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

use std::sync::mpsc::Sender;

use crate::chat::{
    CancellationToken, CompactionState, HistoryRound, TurnStreamEvent, generate_session_summary,
    run_streaming_turn,
};
use crate::config::KimiConfig;

use crate::store::StoredSession;
pub use coordinator::{Coordinator, CoordinatorHandle};
pub use persistence::{ConversationPersistence, NoopConversationPersistence, SessionPersistence};
pub use transcript::{SettledKind, Transcript, TurnResult, TurnState};

const NEEDS_CONFIGURATION_MESSAGE: &str =
    "No provider configured. Use /connect to add a provider before sending messages.";

/// Commands consumed by the single-owner conversation coordinator thread.
#[derive(Debug)]
pub enum Command {
    Enqueue {
        turn_id: String,
        prompt: String,
        config: Option<KimiConfig>,
    },
    Delta {
        turn_id: String,
        text: String,
    },
    Settle {
        turn_id: String,
        result: TurnResult,
    },
    /// A compaction was produced for `turn_id`; the coordinator buffers it and
    /// adopts it only on a clean completed settle (discarded on cancel/error).
    Compacted {
        turn_id: String,
        state: CompactionState,
    },
    /// Toggle the "Auto compacting…" status for a turn.
    CompactionStatus {
        turn_id: String,
        active: bool,
    },
    Cancel {
        turn_id: String,
    },
    QueryStatus {
        respond_to: Sender<ConversationStatus>,
    },
    ResumeSession {
        session: StoredSession,
        turns: Vec<transcript::TranscriptTurn>,
        compaction: CompactionState,
        respond_to: Sender<()>,
    },
    /// A background task generated a session summary; the coordinator (single
    /// writer) persists it and emits [`ConversationEvent::SummaryUpdated`].
    SetSessionSummary {
        session_id: String,
        summary: String,
    },
    Clear,
    Shutdown,
}

/// Transport-agnostic events emitted as the transcript changes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConversationEvent {
    Enqueued {
        turn_id: String,
        seq: u64,
        state: TurnState,
    },
    Activated {
        turn_id: String,
    },
    Delta {
        turn_id: String,
        text: String,
    },
    Settled {
        turn_id: String,
        result: TurnResult,
    },
    /// The "Auto compacting…" status toggled for a turn.
    CompactionStatus {
        turn_id: String,
        active: bool,
    },
    /// The session's generated summary is ready; the TUI upgrades the live
    /// terminal title from the first-prompt placeholder.
    SummaryUpdated {
        session_id: String,
        summary: String,
    },
}

/// Queryable coordinator status used by backend session handlers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConversationStatus {
    pub current_session_id: Option<String>,
    pub has_unsettled_turns: bool,
}

/// A unit of work passed to an injected turn runner.
pub struct TurnJob {
    pub turn_id: String,
    pub history: Vec<HistoryRound>,
    pub compaction: CompactionState,
    pub prompt: String,
    /// Bounded memory context block for the system prompt, when loaded.
    pub memory: Option<String>,
    pub config: KimiConfig,
    pub cancel: CancellationToken,
    pub command_tx: Sender<Command>,
}

/// A unit of work passed to an injected session-summary runner: generate a
/// short title from the session's first round and report it back via
/// [`Command::SetSessionSummary`].
pub struct SummaryJob {
    pub session_id: String,
    pub first_prompt: String,
    pub first_response: String,
    pub config: KimiConfig,
    pub command_tx: Sender<Command>,
}

fn default_runner() -> impl Fn(TurnJob) + Send + Sync + 'static {
    |job| {
        let tx = job.command_tx.clone();
        let turn_id = job.turn_id.clone();
        run_streaming_turn(
            job.turn_id,
            job.history,
            job.compaction,
            job.prompt,
            job.memory,
            job.config,
            job.cancel,
            move |event| {
                let command = match event {
                    TurnStreamEvent::Delta(text) => Command::Delta {
                        turn_id: turn_id.clone(),
                        text,
                    },
                    TurnStreamEvent::Compacted { state } => Command::Compacted {
                        turn_id: turn_id.clone(),
                        state,
                    },
                    TurnStreamEvent::CompactionStarted => Command::CompactionStatus {
                        turn_id: turn_id.clone(),
                        active: true,
                    },
                    TurnStreamEvent::CompactionFinished => Command::CompactionStatus {
                        turn_id: turn_id.clone(),
                        active: false,
                    },
                    TurnStreamEvent::Completed {
                        text,
                        finish_reason,
                    } => Command::Settle {
                        turn_id: turn_id.clone(),
                        result: TurnResult::completed(text, finish_reason),
                    },
                    TurnStreamEvent::Error {
                        error_kind,
                        message,
                    } => Command::Settle {
                        turn_id: turn_id.clone(),
                        result: TurnResult::error(error_kind, message),
                    },
                    TurnStreamEvent::Cancelled => Command::Settle {
                        turn_id: turn_id.clone(),
                        result: TurnResult::cancelled(),
                    },
                };
                let _ = tx.send(command);
            },
        );
    }
}

/// Builds the production session-summary runner: each [`SummaryJob`] is run on a
/// detached thread that reports the result back via [`Command::SetSessionSummary`].
fn default_summary_runner() -> impl Fn(SummaryJob) + Send + Sync + 'static {
    spawn_session_summary
}

/// Max wall-clock time for one background summary generation; on timeout the
/// first-prompt placeholder stands.
const SESSION_SUMMARY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// Runs one session-summary generation on a detached thread with its own
/// current-thread runtime, sending [`Command::SetSessionSummary`] on success.
/// Any error or timeout is swallowed so the placeholder remains (see R8).
fn spawn_session_summary(job: SummaryJob) {
    std::thread::spawn(move || {
        let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        else {
            return;
        };
        let SummaryJob {
            session_id,
            first_prompt,
            first_response,
            config,
            command_tx,
        } = job;
        let generated = runtime.block_on(async {
            tokio::time::timeout(
                SESSION_SUMMARY_TIMEOUT,
                generate_session_summary(&first_prompt, &first_response, config),
            )
            .await
        });
        if let Ok(Ok(summary)) = generated {
            let _ = command_tx.send(Command::SetSessionSummary {
                session_id,
                summary,
            });
        }
    });
}
