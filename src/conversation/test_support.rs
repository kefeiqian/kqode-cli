use std::sync::mpsc::{self, Sender};
use std::time::Duration;

use crate::chat::CancellationToken;
use crate::config::KimiConfig;

use super::transcript::{SettledKind, TurnResult, TurnState};
use super::{Command, ConversationEvent, Coordinator, CoordinatorHandle, TurnJob};

pub const WAIT: Duration = Duration::from_secs(2);

pub enum Action {
    Delta(&'static str),
    Complete(&'static str),
    Error,
    Panic,
    AwaitCancel,
    /// Simulates a turn that races the cancel signal: it self-cancels, then
    /// emits a late delta + completion on the same command channel. The late
    /// delta must be suppressed and the completion overridden to `cancelled`.
    CancelThenComplete(&'static str),
}

pub struct Started {
    pub turn_id: String,
    pub cancel: CancellationToken,
    pub actions: Sender<Action>,
}

pub fn harness() -> (
    CoordinatorHandle,
    mpsc::Receiver<ConversationEvent>,
    mpsc::Receiver<Started>,
) {
    let (event_tx, event_rx) = mpsc::channel();
    let (started_tx, started_rx) = mpsc::channel();
    let handle = Coordinator::start_with_runner(
        move |event| event_tx.send(event).expect("event receiver alive"),
        move |job| run_fake_turn(job, &started_tx),
    );
    (handle, event_rx, started_rx)
}

pub fn enqueue(sender: &Sender<Command>, id: &str) {
    sender
        .send(Command::Enqueue {
            turn_id: id.to_owned(),
            prompt: format!("prompt {id}"),
            config: Some(config()),
        })
        .expect("coordinator alive");
}

pub fn expect_enqueued(events: &mpsc::Receiver<ConversationEvent>, id: &str, state: TurnState) {
    assert!(
        matches!(events.recv_timeout(WAIT).unwrap(), ConversationEvent::Enqueued { turn_id, state: actual, .. } if turn_id == id && actual == state)
    );
}

pub fn expect_activated(events: &mpsc::Receiver<ConversationEvent>, id: &str) {
    assert_eq!(
        events.recv_timeout(WAIT).unwrap(),
        ConversationEvent::Activated {
            turn_id: id.to_owned()
        }
    );
}

pub fn expect_settled(events: &mpsc::Receiver<ConversationEvent>, id: &str, kind: SettledKind) {
    assert!(
        matches!(events.recv_timeout(WAIT).unwrap(), ConversationEvent::Settled { turn_id, result } if turn_id == id && result.kind == kind)
    );
}

fn config() -> KimiConfig {
    KimiConfig {
        api_key: "test-key".to_owned(),
        model: "test-model".to_owned(),
        base_url: "https://example.test".to_owned(),
    }
}

fn run_fake_turn(job: TurnJob, started_tx: &Sender<Started>) {
    let (action_tx, action_rx) = mpsc::channel();
    started_tx
        .send(Started {
            turn_id: job.turn_id.clone(),
            cancel: job.cancel.clone(),
            actions: action_tx,
        })
        .expect("started receiver alive");
    for action in action_rx {
        match action {
            Action::Delta(text) => send_delta(&job, text),
            Action::Complete(text) => {
                send_settle(
                    &job,
                    TurnResult::completed(text.to_owned(), Some("stop".to_owned())),
                );
                break;
            }
            Action::Error => {
                send_settle(&job, TurnResult::error("network", "boom"));
                break;
            }
            Action::Panic => panic!("fake turn panic"),
            Action::AwaitCancel => {
                job.cancel.wait_cancelled();
                send_settle(&job, TurnResult::cancelled());
                break;
            }
            Action::CancelThenComplete(text) => {
                // All three land on one sender, so the coordinator processes
                // Cancel first (setting the cancelling marker) before the late
                // delta + completion — deterministically exercising suppression.
                job.command_tx
                    .send(Command::Cancel {
                        turn_id: job.turn_id.clone(),
                    })
                    .expect("coordinator alive");
                send_delta(&job, "late-and-suppressed");
                send_settle(
                    &job,
                    TurnResult::completed(text.to_owned(), Some("stop".to_owned())),
                );
                break;
            }
        }
    }
}

fn send_delta(job: &TurnJob, text: &str) {
    job.command_tx
        .send(Command::Delta {
            turn_id: job.turn_id.clone(),
            text: text.to_owned(),
        })
        .expect("coordinator alive");
}

fn send_settle(job: &TurnJob, result: TurnResult) {
    job.command_tx
        .send(Command::Settle {
            turn_id: job.turn_id.clone(),
            result,
        })
        .expect("coordinator alive");
}
