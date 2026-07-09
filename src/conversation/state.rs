use std::collections::HashMap;
use std::panic::{self, AssertUnwindSafe};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::thread::{self, JoinHandle};

use crate::chat::{CancellationToken, CompactionState, HistoryRound};
use crate::config::KimiConfig;

use super::persistence::ConversationPersistence;
use super::transcript::{SettledKind, Transcript, TurnResult, TurnState};
use super::{Command, ConversationEvent, ConversationStatus, NEEDS_CONFIGURATION_MESSAGE, TurnJob};

const PANIC_ERROR_KIND: &str = "panic";

pub(super) type EventSink = Arc<dyn Fn(ConversationEvent) + Send + Sync + 'static>;
pub(super) type TurnRunner = Arc<dyn Fn(TurnJob) + Send + Sync + 'static>;

pub(super) struct LoopState {
    transcript: Transcript,
    configs: HashMap<String, Option<KimiConfig>>,
    active_cancel: Option<CancellationToken>,
    /// The active turn id awaiting cancellation, if any. While set, deltas from
    /// that turn are suppressed and its settle is forced to `cancelled`, so a
    /// chunk/completion that races the cancel can never win over the cancel.
    cancelling: Option<String>,
    active_thread: Option<JoinHandle<()>>,
    command_tx: Sender<Command>,
    event_sink: EventSink,
    turn_runner: TurnRunner,
    shutting_down: bool,
    shutdown_requested: Arc<AtomicBool>,
    persistence: Box<dyn ConversationPersistence>,
    /// Active summary + covered boundary for the current session; the coordinator
    /// is the single writer.
    compaction: CompactionState,
    /// A compaction reported by the active turn, adopted only on its clean settle.
    pending_compaction: Option<(String, CompactionState)>,
}

impl LoopState {
    pub(super) fn new(
        command_tx: Sender<Command>,
        event_sink: EventSink,
        turn_runner: TurnRunner,
        shutdown_requested: Arc<AtomicBool>,
        persistence: Box<dyn ConversationPersistence>,
    ) -> Self {
        Self {
            transcript: Transcript::default(),
            configs: HashMap::new(),
            active_cancel: None,
            cancelling: None,
            active_thread: None,
            command_tx,
            event_sink,
            turn_runner,
            shutting_down: false,
            shutdown_requested,
            persistence,
            compaction: CompactionState::default(),
            pending_compaction: None,
        }
    }

    pub(super) fn handle(&mut self, command: Command) -> bool {
        match command {
            Command::Enqueue {
                turn_id,
                prompt,
                config,
            } => self.enqueue(turn_id, prompt, config),
            Command::Delta { turn_id, text } => self.emit_current_delta(turn_id, text),
            Command::Settle { turn_id, result } => self.settle(turn_id, result),
            Command::Compacted { turn_id, state } => {
                self.pending_compaction = Some((turn_id, state));
            }
            Command::Cancel { turn_id }
                if self.transcript.active_id() == Some(turn_id.as_str()) =>
            {
                self.cancelling = Some(turn_id);
                if let Some(cancel) = &self.active_cancel {
                    cancel.cancel();
                }
            }
            Command::QueryStatus { respond_to } => {
                let _ = respond_to.send(ConversationStatus {
                    current_session_id: self.persistence.current_session_id(),
                    has_unsettled_turns: self.transcript.has_unsettled(),
                });
            }
            Command::ResumeSession {
                session,
                turns,
                respond_to,
            } => {
                self.persistence.attach_session(session);
                self.transcript.replace_with(turns);
                self.compaction = CompactionState::default();
                self.pending_compaction = None;
                let _ = respond_to.send(());
            }
            Command::Clear => self.clear(),
            Command::Shutdown => self.shutdown(),
            Command::Cancel { .. } => {}
        }
        self.is_shutting_down() && !self.transcript.has_active()
    }

    fn enqueue(&mut self, turn_id: String, prompt: String, config: Option<KimiConfig>) {
        if self.is_shutting_down() {
            return;
        }
        let state = if self.transcript.has_active() {
            TurnState::Pending
        } else {
            TurnState::Active
        };
        let seq = self.transcript.push(turn_id.clone(), prompt, state);
        self.configs.insert(turn_id.clone(), config);
        if let Err(message) =
            self.persistence
                .on_enqueue(&turn_id, seq, &self.active_prompt(&turn_id))
        {
            self.transcript.remove_turn(&turn_id);
            (self.event_sink)(ConversationEvent::Settled {
                turn_id,
                result: TurnResult::error("sessionPersistence", message),
            });
            return;
        }
        (self.event_sink)(ConversationEvent::Enqueued {
            turn_id: turn_id.clone(),
            seq,
            state,
        });
        if state == TurnState::Active {
            self.start_active(turn_id);
        }
    }

    fn emit_current_delta(&self, turn_id: String, text: String) {
        if self.transcript.active_id() == Some(turn_id.as_str())
            && self.cancelling.as_deref() != Some(turn_id.as_str())
        {
            (self.event_sink)(ConversationEvent::Delta { turn_id, text });
        }
    }

    fn settle(&mut self, turn_id: String, result: TurnResult) {
        // A turn awaiting cancellation always settles `cancelled`, so a chunk or
        // completion that raced the cancel signal cannot settle it otherwise.
        let result = if self.cancelling.as_deref() == Some(turn_id.as_str()) {
            TurnResult::cancelled()
        } else {
            result
        };
        if !self.transcript.settle_active(&turn_id, result.clone()) {
            return;
        }
        if self.cancelling.as_deref() == Some(turn_id.as_str()) {
            self.cancelling = None;
        }
        // Adopt a buffered compaction only on a clean completed settle; discard on
        // cancel/error (the result was already forced to `cancelled` above when
        // this turn was being cancelled). `take()` consumes the buffer either way.
        if let Some((pending_turn, state)) = self.pending_compaction.take()
            && pending_turn == turn_id
            && result.kind == SettledKind::Completed
        {
            self.compaction = state;
        }
        self.active_cancel = None;
        if let Some(thread) = self.active_thread.take() {
            let _ = thread.join();
        }
        if let Err(message) = self.persistence.on_settle(&turn_id, &result) {
            eprintln!("KQODE_SESSION_PERSISTENCE_ERROR: {message}");
        }
        (self.event_sink)(ConversationEvent::Settled { turn_id, result });
        if self.is_shutting_down() {
            return;
        }
        if let Some(next_turn_id) = self.transcript.activate_next_pending() {
            (self.event_sink)(ConversationEvent::Activated {
                turn_id: next_turn_id.clone(),
            });
            self.start_active(next_turn_id);
        }
    }

    fn start_active(&mut self, turn_id: String) {
        let Some(config) = self.configs.remove(&turn_id).flatten() else {
            self.settle(
                turn_id,
                TurnResult::needs_configuration(NEEDS_CONFIGURATION_MESSAGE),
            );
            return;
        };
        let cancel = CancellationToken::new();
        self.active_cancel = Some(cancel.clone());
        let command_tx = self.command_tx.clone();
        let runner = Arc::clone(&self.turn_runner);
        let prompt = self.active_prompt(&turn_id);
        let history = self.completed_history();
        let compaction = self.compaction.clone();
        self.active_thread = Some(thread::spawn(move || {
            let panic_result = panic::catch_unwind(AssertUnwindSafe(|| {
                runner(TurnJob {
                    turn_id: turn_id.clone(),
                    history,
                    compaction,
                    prompt,
                    config,
                    cancel,
                    command_tx: command_tx.clone(),
                });
            }));
            if panic_result.is_err() {
                let _ = command_tx.send(Command::Settle {
                    turn_id,
                    result: TurnResult::error(PANIC_ERROR_KIND, "turn runner panicked"),
                });
            }
        }));
    }

    fn active_prompt(&self, turn_id: &str) -> String {
        self.transcript
            .turns()
            .iter()
            .find(|turn| turn.turn_id == turn_id)
            .map(|turn| turn.prompt.clone())
            .unwrap_or_default()
    }

    /// Snapshots the prior completed rounds (user prompt + assistant reply) in
    /// sequence order for assembly into the outgoing request. Non-completed
    /// rounds (cancelled/errored/needs-configuration) are excluded, and the
    /// durable transcript is only read, never mutated.
    fn completed_history(&self) -> Vec<HistoryRound> {
        self.transcript
            .turns()
            .iter()
            .filter_map(|turn| {
                if turn.state != TurnState::Settled {
                    return None;
                }
                let result = turn.result.as_ref()?;
                if result.kind != SettledKind::Completed {
                    return None;
                }
                if self.compaction.covers(turn.seq) {
                    return None;
                }
                let assistant = result.text.clone()?;
                Some(HistoryRound::new(turn.seq, turn.prompt.clone(), assistant))
            })
            .collect()
    }

    fn clear(&mut self) {
        // Force the active turn (if any) to settle `cancelled` and suppress its
        // remaining events, matching the abandon-active semantics.
        if let Some(active) = self.transcript.active_id() {
            self.cancelling = Some(active.to_owned());
        }
        if let Some(cancel) = &self.active_cancel {
            cancel.cancel();
        }
        if let Err(message) = self.persistence.on_clear(self.transcript.turns()) {
            eprintln!("KQODE_SESSION_PERSISTENCE_ERROR: {message}");
        }
        self.compaction = CompactionState::default();
        self.pending_compaction = None;
        self.configs.clear();
        self.transcript.drop_pending();
        self.transcript.drop_settled();
    }

    fn shutdown(&mut self) {
        self.shutting_down = true;
        self.shutdown_requested.store(true, Ordering::SeqCst);
        self.configs.clear();
        self.transcript.drop_pending();
    }

    fn is_shutting_down(&self) -> bool {
        self.shutting_down || self.shutdown_requested.load(Ordering::SeqCst)
    }
}
