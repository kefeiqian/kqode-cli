use std::sync::mpsc;
use std::time::Duration;

use super::test_support::{
    Action, WAIT, enqueue, expect_activated, expect_enqueued, expect_settled, harness,
};
use super::transcript::{SettledKind, TurnResult, TurnState};
use super::{
    Command, ConversationEvent, ConversationPersistence, Coordinator, CoordinatorHandle,
    NEEDS_CONFIGURATION_MESSAGE, SummaryJob, TurnJob,
};

struct FailSecondEnqueuePersistence {
    fail_after_first: bool,
}

impl ConversationPersistence for FailSecondEnqueuePersistence {
    fn on_enqueue(&mut self, _turn_id: &str, _seq: u64, _prompt: &str) -> Result<(), String> {
        if self.fail_after_first {
            Err("session persistence down".to_owned())
        } else {
            self.fail_after_first = true;
            Ok(())
        }
    }

    fn on_settle(&mut self, _turn_id: &str, _result: &TurnResult) -> Result<(), String> {
        Ok(())
    }

    fn on_clear(&mut self, _turns: &[super::transcript::TranscriptTurn]) -> Result<(), String> {
        Ok(())
    }

    fn on_compacted(&mut self, _covered_through_seq: u64, _summary: &str) -> Result<(), String> {
        Ok(())
    }

    fn on_summary_generated(&mut self, _summary: &str) -> Result<(), String> {
        Ok(())
    }

    fn current_session_id(&self) -> Option<String> {
        None
    }

    fn attach_session(&mut self, _session: crate::store::StoredSession) {}
}

#[test]
fn idle_submit_streams_and_settles() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    expect_enqueued(&events, "A", TurnState::Active);
    let a = started.recv_timeout(WAIT).unwrap();
    a.actions.send(Action::Delta("hi")).unwrap();
    assert!(matches!(
        events.recv_timeout(WAIT).unwrap(),
        ConversationEvent::Delta { .. }
    ));
    a.actions.send(Action::Complete("done")).unwrap();
    expect_settled(&events, "A", SettledKind::Completed);
    handle.shutdown_and_join();
}

#[test]
fn pending_turn_activates_once_after_active_settles() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    expect_enqueued(&events, "A", TurnState::Active);
    let a = started.recv_timeout(WAIT).unwrap();
    enqueue(&sender, "B");
    expect_enqueued(&events, "B", TurnState::Pending);
    a.actions.send(Action::Complete("a")).unwrap();
    expect_settled(&events, "A", SettledKind::Completed);
    expect_activated(&events, "B");
    let b = started.recv_timeout(WAIT).unwrap();
    assert_eq!(b.turn_id, "B");
    assert!(events.recv_timeout(Duration::from_millis(50)).is_err());
    b.actions.send(Action::Complete("b")).unwrap();
    expect_settled(&events, "B", SettledKind::Completed);
    handle.shutdown_and_join();
}

#[test]
fn burst_preserves_order_and_ignores_stale_settles() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    for id in ["A", "B", "C"] {
        enqueue(&sender, id);
    }
    let states: Vec<_> = (0..3).map(|_| events.recv_timeout(WAIT).unwrap()).collect();
    assert!(
        matches!(states[0], ConversationEvent::Enqueued { ref turn_id, state: TurnState::Active, .. } if turn_id == "A")
    );
    assert!(
        matches!(states[1], ConversationEvent::Enqueued { ref turn_id, state: TurnState::Pending, .. } if turn_id == "B")
    );
    assert!(
        matches!(states[2], ConversationEvent::Enqueued { ref turn_id, state: TurnState::Pending, .. } if turn_id == "C")
    );
    let a = started.recv_timeout(WAIT).unwrap();
    sender
        .send(Command::Settle {
            turn_id: "B".to_owned(),
            result: TurnResult::completed("stale".to_owned(), None),
        })
        .unwrap();
    assert!(events.recv_timeout(Duration::from_millis(50)).is_err());
    a.actions.send(Action::Complete("a")).unwrap();
    expect_settled(&events, "A", SettledKind::Completed);
    expect_activated(&events, "B");
    let b = started.recv_timeout(WAIT).unwrap();
    b.actions.send(Action::Complete("b")).unwrap();
    expect_settled(&events, "B", SettledKind::Completed);
    expect_activated(&events, "C");
    let c = started.recv_timeout(WAIT).unwrap();
    c.actions.send(Action::Complete("c")).unwrap();
    expect_settled(&events, "C", SettledKind::Completed);
    handle.shutdown_and_join();
}

#[test]
fn error_and_panic_still_promote_next_turn() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    let _ = events.recv_timeout(WAIT).unwrap();
    let a = started.recv_timeout(WAIT).unwrap();
    enqueue(&sender, "B");
    let _ = events.recv_timeout(WAIT).unwrap();
    a.actions.send(Action::Error).unwrap();
    expect_settled(&events, "A", SettledKind::Error);
    expect_activated(&events, "B");
    let b = started.recv_timeout(WAIT).unwrap();
    b.actions.send(Action::Panic).unwrap();
    expect_settled(&events, "B", SettledKind::Error);
    handle.shutdown_and_join();
}

#[test]
fn missing_config_settles_with_connect_guidance_without_starting_runner() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    sender
        .send(Command::Enqueue {
            turn_id: "A".to_owned(),
            prompt: "prompt A".to_owned(),
            config: None,
        })
        .unwrap();
    expect_enqueued(&events, "A", TurnState::Active);

    match events.recv_timeout(WAIT).unwrap() {
        ConversationEvent::Settled { turn_id, result } => {
            assert_eq!(turn_id, "A");
            assert_eq!(result.kind, SettledKind::NeedsConfiguration);
            assert_eq!(result.message.as_deref(), Some(NEEDS_CONFIGURATION_MESSAGE));
        }
        event => panic!("expected missing-config settle, got {event:?}"),
    }
    assert!(started.recv_timeout(Duration::from_millis(50)).is_err());
    handle.shutdown_and_join();
}

#[test]
fn shutdown_drops_pending_and_waits_for_in_flight_only() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    let _ = events.recv_timeout(WAIT).unwrap();
    let a = started.recv_timeout(WAIT).unwrap();
    enqueue(&sender, "B");
    let _ = events.recv_timeout(WAIT).unwrap();
    sender.send(Command::Shutdown).unwrap();
    let (done_tx, done_rx) = mpsc::channel();
    let joiner = std::thread::spawn(move || {
        handle.shutdown_and_join();
        done_tx.send(()).unwrap();
    });
    assert!(done_rx.try_recv().is_err());
    a.actions.send(Action::Complete("a")).unwrap();
    done_rx.recv_timeout(WAIT).unwrap();
    joiner.join().unwrap();
    assert!(started.try_recv().is_err());
}

#[test]
fn cancel_active_settles_cancelled_and_promotes_next() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    let _ = events.recv_timeout(WAIT).unwrap();
    let a = started.recv_timeout(WAIT).unwrap();
    enqueue(&sender, "B");
    let _ = events.recv_timeout(WAIT).unwrap();
    assert!(!a.cancel.is_cancelled());
    a.actions.send(Action::AwaitCancel).unwrap();
    sender
        .send(Command::Cancel {
            turn_id: "A".to_owned(),
        })
        .unwrap();
    expect_settled(&events, "A", SettledKind::Cancelled);
    expect_activated(&events, "B");
    let b = started.recv_timeout(WAIT).unwrap();
    assert_eq!(b.turn_id, "B");
    b.actions.send(Action::Complete("b")).unwrap();
    expect_settled(&events, "B", SettledKind::Completed);
    handle.shutdown_and_join();
}

#[test]
fn cancel_overrides_a_racing_completion_and_suppresses_late_delta() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    expect_enqueued(&events, "A", TurnState::Active);
    let a = started.recv_timeout(WAIT).unwrap();
    // The turn self-cancels then races a late delta + completion on one channel.
    a.actions
        .send(Action::CancelThenComplete("late text"))
        .unwrap();
    // The late delta must be suppressed (never observed) and the completion must
    // be overridden to `cancelled` — so the next event is the cancelled settle.
    expect_settled(&events, "A", SettledKind::Cancelled);
    handle.shutdown_and_join();
}

#[test]
fn clear_drops_pending_and_abandons_active() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    expect_enqueued(&events, "A", TurnState::Active);
    let a = started.recv_timeout(WAIT).unwrap();
    enqueue(&sender, "B");
    expect_enqueued(&events, "B", TurnState::Pending);
    // A awaits cancel; clear abandons it and drops pending B.
    a.actions.send(Action::AwaitCancel).unwrap();
    sender.send(Command::Clear).unwrap();
    expect_settled(&events, "A", SettledKind::Cancelled);
    // B was dropped by clear: it never activates or starts a runner.
    assert!(started.recv_timeout(Duration::from_millis(200)).is_err());
    // A fresh submit starts active immediately (transcript history is gone).
    enqueue(&sender, "C");
    expect_enqueued(&events, "C", TurnState::Active);
    let c = started.recv_timeout(WAIT).unwrap();
    c.actions.send(Action::Complete("c")).unwrap();
    expect_settled(&events, "C", SettledKind::Completed);
    handle.shutdown_and_join();
}

#[test]
fn clear_empties_settled_history_and_starts_fresh() {
    let (handle, events, started) = harness();
    let sender = handle.sender();
    enqueue(&sender, "A");
    expect_enqueued(&events, "A", TurnState::Active);
    let a = started.recv_timeout(WAIT).unwrap();
    a.actions.send(Action::Complete("done")).unwrap();
    expect_settled(&events, "A", SettledKind::Completed);
    // Clear with only a settled turn: nothing to abandon, history emptied.
    sender.send(Command::Clear).unwrap();
    enqueue(&sender, "B");
    expect_enqueued(&events, "B", TurnState::Active);
    let b = started.recv_timeout(WAIT).unwrap();
    b.actions.send(Action::Complete("b")).unwrap();
    expect_settled(&events, "B", SettledKind::Completed);
    handle.shutdown_and_join();
}

#[test]
fn queued_turn_with_persistence_failure_does_not_activate_later() {
    let (event_tx, event_rx) = mpsc::channel();
    let (started_tx, started_rx) = mpsc::channel();
    let handle = Coordinator::start_with_runner(
        move |event| event_tx.send(event).expect("event receiver alive"),
        move |job: TurnJob| super::test_support::run_fake_turn(job, &started_tx),
        Box::new(FailSecondEnqueuePersistence {
            fail_after_first: false,
        }),
    );
    let sender = handle.sender();
    enqueue(&sender, "A");
    expect_enqueued(&event_rx, "A", TurnState::Active);
    let a = started_rx.recv_timeout(WAIT).unwrap();
    enqueue(&sender, "B");
    match event_rx.recv_timeout(WAIT).unwrap() {
        ConversationEvent::Settled { turn_id, result } => {
            assert_eq!(turn_id, "B");
            assert_eq!(result.kind, SettledKind::Error);
            assert_eq!(result.error_kind.as_deref(), Some("sessionPersistence"));
        }
        other => panic!("expected queued failure settle, got {other:?}"),
    }
    a.actions.send(Action::Complete("a")).unwrap();
    expect_settled(&event_rx, "A", SettledKind::Completed);
    assert!(started_rx.recv_timeout(Duration::from_millis(200)).is_err());
    handle.shutdown_and_join();
}

struct StubSessionPersistence {
    session_id: String,
    summaries: mpsc::Sender<String>,
}

impl ConversationPersistence for StubSessionPersistence {
    fn on_enqueue(&mut self, _turn_id: &str, _seq: u64, _prompt: &str) -> Result<(), String> {
        Ok(())
    }

    fn on_settle(&mut self, _turn_id: &str, _result: &TurnResult) -> Result<(), String> {
        Ok(())
    }

    fn on_clear(&mut self, _turns: &[super::transcript::TranscriptTurn]) -> Result<(), String> {
        Ok(())
    }

    fn on_compacted(&mut self, _covered_through_seq: u64, _summary: &str) -> Result<(), String> {
        Ok(())
    }

    fn on_summary_generated(&mut self, summary: &str) -> Result<(), String> {
        let _ = self.summaries.send(summary.to_owned());
        Ok(())
    }

    fn current_session_id(&self) -> Option<String> {
        Some(self.session_id.clone())
    }

    fn attach_session(&mut self, _session: crate::store::StoredSession) {}
}

struct SummaryHarness {
    handle: CoordinatorHandle,
    events: mpsc::Receiver<ConversationEvent>,
    started: mpsc::Receiver<super::test_support::Started>,
    summary_jobs: mpsc::Receiver<(String, String, String)>,
    persisted: mpsc::Receiver<String>,
}

/// Builds a coordinator whose summary runner records each [`SummaryJob`] and
/// reports a fixed generated title back, exercising the trigger + persist + emit
/// path without a real provider.
fn summary_harness() -> SummaryHarness {
    let (event_tx, events) = mpsc::channel();
    let (started_tx, started) = mpsc::channel();
    let (job_tx, summary_jobs) = mpsc::channel();
    let (persist_tx, persisted) = mpsc::channel();
    let handle = Coordinator::start_with_runners(
        move |event| event_tx.send(event).expect("event receiver alive"),
        move |job: TurnJob| super::test_support::run_fake_turn(job, &started_tx),
        move |job: SummaryJob| {
            job_tx
                .send((
                    job.session_id.clone(),
                    job.first_prompt.clone(),
                    job.first_response.clone(),
                ))
                .expect("job receiver alive");
            let _ = job.command_tx.send(Command::SetSessionSummary {
                session_id: job.session_id,
                summary: "Fix the parser bug".to_owned(),
            });
        },
        Box::new(StubSessionPersistence {
            session_id: "sess-1".to_owned(),
            summaries: persist_tx,
        }),
    );
    SummaryHarness {
        handle,
        events,
        started,
        summary_jobs,
        persisted,
    }
}

fn drain_until_settled(events: &mpsc::Receiver<ConversationEvent>, turn_id: &str) {
    loop {
        match events.recv_timeout(WAIT).unwrap() {
            ConversationEvent::Settled { turn_id: id, .. } if id == turn_id => break,
            _ => continue,
        }
    }
}

fn complete_turn(h: &SummaryHarness, id: &str, reply: &'static str) {
    enqueue(&h.handle.sender(), id);
    let started = h.started.recv_timeout(WAIT).unwrap();
    started.actions.send(Action::Complete(reply)).unwrap();
}

fn stored_session(id: &str) -> crate::store::StoredSession {
    crate::store::StoredSession {
        id: id.to_owned(),
        created_at: 0,
        modified_at: 0,
        workspace_cwd: "w".to_owned(),
        canonical_workspace_cwd: "w".to_owned(),
        session_log_path: "log".to_owned(),
        first_prompt_summary: Some("first".to_owned()),
    }
}

#[test]
fn first_completed_turn_requests_summary_and_emits_update() {
    let h = summary_harness();
    complete_turn(&h, "t1", "created parser.rs");

    let (session_id, first_prompt, first_response) = h.summary_jobs.recv_timeout(WAIT).unwrap();
    assert_eq!(session_id, "sess-1");
    assert_eq!(first_prompt, "prompt t1");
    assert_eq!(first_response, "created parser.rs");

    // U4: the generated summary is persisted and emitted for the live title.
    assert_eq!(
        h.persisted.recv_timeout(WAIT).unwrap(),
        "Fix the parser bug"
    );
    let update = loop {
        match h.events.recv_timeout(WAIT).unwrap() {
            ConversationEvent::SummaryUpdated {
                session_id,
                summary,
            } => break (session_id, summary),
            _ => continue,
        }
    };
    assert_eq!(
        update,
        ("sess-1".to_owned(), "Fix the parser bug".to_owned())
    );
    h.handle.shutdown_and_join();
}

#[test]
fn summary_requested_only_once_per_session() {
    let h = summary_harness();
    complete_turn(&h, "t1", "r1");
    let _ = h.summary_jobs.recv_timeout(WAIT).unwrap();

    complete_turn(&h, "t2", "r2");
    drain_until_settled(&h.events, "t2");
    assert!(h.summary_jobs.try_recv().is_err());
    h.handle.shutdown_and_join();
}

#[test]
fn errored_first_turn_defers_summary_to_next_completed_turn() {
    let h = summary_harness();
    enqueue(&h.handle.sender(), "t1");
    let started = h.started.recv_timeout(WAIT).unwrap();
    started.actions.send(Action::Error).unwrap();
    drain_until_settled(&h.events, "t1");
    assert!(h.summary_jobs.try_recv().is_err());

    complete_turn(&h, "t2", "r2");
    let (session_id, first_prompt, first_response) = h.summary_jobs.recv_timeout(WAIT).unwrap();
    assert_eq!(session_id, "sess-1");
    assert_eq!(first_prompt, "prompt t2");
    assert_eq!(first_response, "r2");
    h.handle.shutdown_and_join();
}

#[test]
fn resumed_session_does_not_request_summary() {
    let h = summary_harness();
    let (tx, rx) = mpsc::channel();
    h.handle
        .sender()
        .send(Command::ResumeSession {
            session: stored_session("sess-1"),
            turns: vec![],
            compaction: crate::chat::CompactionState::default(),
            respond_to: tx,
        })
        .unwrap();
    rx.recv_timeout(WAIT).unwrap();

    complete_turn(&h, "t1", "r1");
    drain_until_settled(&h.events, "t1");
    assert!(h.summary_jobs.try_recv().is_err());
    h.handle.shutdown_and_join();
}
