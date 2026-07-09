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
    CancellationToken, CompactionState, HistoryRound, TurnStreamEvent, run_streaming_turn,
};
use crate::config::KimiConfig;

use crate::store::StoredSession;
pub use coordinator::{Coordinator, CoordinatorHandle};
pub use persistence::{ConversationPersistence, NoopConversationPersistence, SessionPersistence};
pub use transcript::{SettledKind, Transcript, TurnResult, TurnState};

const NEEDS_CONFIGURATION_MESSAGE: &str =
    "No provider configured. Use /login to add a provider before sending messages.";

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
