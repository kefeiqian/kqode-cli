use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};

/// Cooperative cancellation signal shared with one streaming turn.
#[derive(Clone, Debug)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
    wake: Arc<(Mutex<bool>, Condvar)>,
}

impl CancellationToken {
    #[must_use]
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            wake: Arc::new((Mutex::new(false), Condvar::new())),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        let (lock, condvar) = &*self.wake;
        *lock.lock().expect("cancellation mutex poisoned") = true;
        condvar.notify_all();
    }

    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub fn wait_cancelled(&self) {
        let (lock, condvar) = &*self.wake;
        let mut cancelled = lock.lock().expect("cancellation mutex poisoned");
        while !*cancelled {
            cancelled = condvar
                .wait(cancelled)
                .expect("cancellation mutex poisoned");
        }
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

/// Completion and streaming events emitted by a turn runner.
#[derive(Debug)]
pub enum TurnStreamEvent {
    Delta(String),
    Completed {
        text: String,
        finish_reason: Option<String>,
    },
    Error {
        error_kind: String,
        message: String,
    },
    Cancelled,
}
