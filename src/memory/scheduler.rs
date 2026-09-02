//! Lifecycle extraction scheduling (U6): cursor-gated, coalesced, proposal-only.
//!
//! Runs outside the live prompt path. Only completed, settled rounds after a
//! per-session cursor are considered; the cursor advances past them regardless
//! of outcome so they are never reconsidered. Concurrent triggers for one
//! session are coalesced so a single worker runs per session at a time.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;

use super::extraction::{ExtractionInput, ExtractionOutcome, ExtractionRound, Extractor};
use super::index::MemoryService;
use crate::conversation::session_log::SessionLogEvent;

/// Settled-kind label of a completed round (only these are extracted).
const COMPLETED_KIND: &str = "completed";

/// What triggered a scheduling attempt.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExtractionTrigger {
    /// Backend startup / resume scan.
    Startup,
    /// A session was resumed.
    Resume,
    /// The backend is exiting cleanly.
    CleanExit,
    /// An idle timer elapsed.
    Idle,
    /// An explicit user request.
    Explicit,
}

/// Result of one scheduling attempt.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExtractionRun {
    /// Another run for this session was already in flight (coalesced away).
    Coalesced,
    /// No completed settled rounds after the cursor.
    NoEligibleTurns,
    /// Ran: the outcome-kind label, the covered boundary, and whether an inbox
    /// entry was created.
    Ran {
        outcome: &'static str,
        covered_through_seq: u64,
        created_inbox: bool,
    },
}

/// Serializes extraction per session so two triggers can't run it concurrently.
#[derive(Default)]
pub struct ExtractionScheduler {
    in_flight: Mutex<HashSet<String>>,
}

impl ExtractionScheduler {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Runs extraction for one session under coalescing.
    ///
    /// Reads the session's cursor, gathers only completed settled rounds after
    /// it, invokes `extractor`, records the (validated) outcome, and advances the
    /// cursor past the considered rounds. Never spawns provider calls itself —
    /// the injected `extractor` owns that decision.
    pub fn run_session<E: Extractor>(
        &self,
        service: &MemoryService,
        session_id: &str,
        session_log_path: &Path,
        _trigger: ExtractionTrigger,
        extractor: &E,
    ) -> ExtractionRun {
        if !self.claim(session_id) {
            return ExtractionRun::Coalesced;
        }
        let result = self.run_inner(service, session_id, session_log_path, extractor);
        self.release(session_id);
        result
    }

    fn run_inner<E: Extractor>(
        &self,
        service: &MemoryService,
        session_id: &str,
        session_log_path: &Path,
        extractor: &E,
    ) -> ExtractionRun {
        let cursor = service
            .store()
            .memory_cursor(session_id)
            .ok()
            .flatten()
            .unwrap_or(-1);
        let rounds = eligible_rounds(session_log_path, cursor);
        let Some(max_seq) = rounds.iter().map(|round| round.seq).max() else {
            return ExtractionRun::NoEligibleTurns;
        };

        let outcome = extractor.extract(&ExtractionInput {
            session_id: session_id.to_owned(),
            rounds,
        });
        let created_inbox = service
            .record_extraction_outcome(session_id, max_seq, &outcome)
            .unwrap_or(None)
            .is_some();
        // Advance the cursor past the considered rounds regardless of outcome so
        // a NoOp/blocked/failed run does not re-process the same turns forever.
        let _ = service.advance_cursor(session_id, max_seq);

        ExtractionRun::Ran {
            outcome: outcome_label(&outcome),
            covered_through_seq: max_seq,
            created_inbox,
        }
    }

    /// Marks `session_id` in flight; returns `false` when a run is already active.
    fn claim(&self, session_id: &str) -> bool {
        self.in_flight
            .lock()
            .expect("extraction in-flight lock")
            .insert(session_id.to_owned())
    }

    fn release(&self, session_id: &str) {
        self.in_flight
            .lock()
            .expect("extraction in-flight lock")
            .remove(session_id);
    }
}

/// Gathers completed settled rounds with `seq > after_seq`, ordered by `seq`.
///
/// Active/pending turns (enqueued, never settled) and cancelled/errored/
/// interrupted turns (settled with a non-completed kind) are excluded.
fn eligible_rounds(session_log_path: &Path, after_seq: i64) -> Vec<ExtractionRound> {
    let Ok(contents) = std::fs::read_to_string(session_log_path) else {
        return Vec::new();
    };
    let mut enqueued: HashMap<String, (u64, String)> = HashMap::new();
    let mut rounds = Vec::new();
    for line in contents.lines() {
        let Ok(event) = serde_json::from_str::<SessionLogEvent>(line) else {
            continue;
        };
        match event {
            SessionLogEvent::TurnEnqueued {
                turn_id,
                seq,
                prompt,
                ..
            } => {
                enqueued.insert(turn_id, (seq, prompt));
            }
            SessionLogEvent::TurnSettled {
                turn_id,
                settled_kind,
                text,
                ..
            } => {
                if settled_kind == COMPLETED_KIND
                    && let Some((seq, prompt)) = enqueued.remove(&turn_id)
                    && i64::try_from(seq).is_ok_and(|value| value > after_seq)
                {
                    rounds.push(ExtractionRound {
                        seq,
                        prompt,
                        response: text.unwrap_or_default(),
                    });
                }
            }
            SessionLogEvent::SessionStarted { .. }
            | SessionLogEvent::Compacted { .. }
            | SessionLogEvent::SummaryGenerated { .. } => {}
        }
    }
    rounds.sort_by_key(|round| round.seq);
    rounds
}

fn outcome_label(outcome: &ExtractionOutcome) -> &'static str {
    match outcome {
        ExtractionOutcome::NoOp => "noop",
        ExtractionOutcome::Candidate(_) => "candidate",
        ExtractionOutcome::ActiveUpdate(_) => "active_update",
        ExtractionOutcome::BlockedSensitive => "blocked_sensitive",
        ExtractionOutcome::Failed(_) => "failed",
    }
}
