use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use tokio::sync::Notify;

/// Coordinates cancellation across one runtime-owned operation.
#[derive(Clone, Default)]
pub struct CancellationToken {
    state: Arc<CancellationState>,
}

#[derive(Default)]
struct CancellationState {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancellationToken {
    /// Marks the operation as cancelled and wakes current waiters.
    pub fn cancel(&self) {
        if !self.state.cancelled.swap(true, Ordering::AcqRel) {
            self.state.notify.notify_waiters();
        }
    }

    /// Returns whether cancellation has been requested.
    pub fn is_cancelled(&self) -> bool {
        self.state.cancelled.load(Ordering::Acquire)
    }

    /// Waits until cancellation is requested.
    pub async fn cancelled(&self) {
        loop {
            let notified = self.state.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

/// Compatibility name used by the current desktop inference adapters.
pub type ChatCancellationToken = CancellationToken;

#[cfg(test)]
mod tests {
    use super::CancellationToken;

    #[tokio::test]
    async fn wakes_waiters_when_cancelled() {
        let token = CancellationToken::default();
        let waiting_token = token.clone();
        let waiter = tokio::spawn(async move {
            waiting_token.cancelled().await;
        });

        token.cancel();
        waiter.await.unwrap();

        assert!(token.is_cancelled());
    }
}
