use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};

use super::state::LoopState;
use super::{
    Command, ConversationEvent, ConversationPersistence, SummaryJob, TurnJob, default_runner,
    default_summary_runner,
};

/// Handle used by backend request handlers to command the coordinator.
pub struct CoordinatorHandle {
    sender: Sender<Command>,
    join: Option<JoinHandle<()>>,
    shutdown_requested: Arc<AtomicBool>,
}

impl CoordinatorHandle {
    #[must_use]
    pub fn sender(&self) -> Sender<Command> {
        self.sender.clone()
    }

    /// Requests shutdown and waits for the coordinator thread to exit.
    ///
    /// # Panics
    ///
    /// Panics if the coordinator thread itself panicked.
    pub fn shutdown_and_join(mut self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
        let _ = self.sender.send(Command::Shutdown);
        drop(self.sender);
        if let Some(join) = self.join.take() {
            join.join()
                .expect("conversation coordinator thread panicked");
        }
    }
}

/// Starts the production coordinator using the real streaming turn runner.
pub struct Coordinator;

impl Coordinator {
    #[must_use]
    pub fn start<E>(
        event_sink: E,
        persistence: Box<dyn ConversationPersistence>,
    ) -> CoordinatorHandle
    where
        E: Fn(ConversationEvent) + Send + Sync + 'static,
    {
        Self::start_with_runner(event_sink, default_runner(), persistence)
    }

    #[must_use]
    pub fn start_with_runner<E, R>(
        event_sink: E,
        turn_runner: R,
        persistence: Box<dyn ConversationPersistence>,
    ) -> CoordinatorHandle
    where
        E: Fn(ConversationEvent) + Send + Sync + 'static,
        R: Fn(TurnJob) + Send + Sync + 'static,
    {
        Self::start_with_runners(
            event_sink,
            turn_runner,
            default_summary_runner(),
            persistence,
        )
    }

    #[must_use]
    pub fn start_with_runners<E, R, S>(
        event_sink: E,
        turn_runner: R,
        summary_runner: S,
        persistence: Box<dyn ConversationPersistence>,
    ) -> CoordinatorHandle
    where
        E: Fn(ConversationEvent) + Send + Sync + 'static,
        R: Fn(TurnJob) + Send + Sync + 'static,
        S: Fn(SummaryJob) + Send + Sync + 'static,
    {
        let (sender, receiver) = mpsc::channel();
        let loop_sender = sender.clone();
        let sink = Arc::new(event_sink);
        let runner = Arc::new(turn_runner);
        let summary = Arc::new(summary_runner);
        let shutdown_requested = Arc::new(AtomicBool::new(false));
        let loop_shutdown_requested = Arc::clone(&shutdown_requested);
        let join = thread::spawn(move || {
            let mut loop_state = LoopState::new(
                loop_sender,
                sink,
                runner,
                summary,
                loop_shutdown_requested,
                persistence,
            );
            while let Ok(command) = receiver.recv() {
                if loop_state.handle(command) {
                    break;
                }
            }
        });
        CoordinatorHandle {
            sender,
            join: Some(join),
            shutdown_requested,
        }
    }
}
