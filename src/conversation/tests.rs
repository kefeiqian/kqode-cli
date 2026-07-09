use std::sync::mpsc;
use std::time::Duration;

use super::test_support::{
    Action, WAIT, enqueue, expect_activated, expect_enqueued, expect_settled, harness,
};
use super::transcript::{SettledKind, TurnResult, TurnState};
use super::{
    Command, ConversationEvent, ConversationPersistence, Coordinator, NEEDS_CONFIGURATION_MESSAGE,
    TurnJob,
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
