use super::SandboxAccountSetupError as Error;
use crate::cancellation::CancellationToken;
use std::time::{Duration, Instant};

/// Cooperative limits around blocking setup and read-only native operations.
pub(super) struct Guard<'a> {
    deadline: Instant,
    cancellation: &'a CancellationToken,
}

impl<'a> Guard<'a> {
    pub fn new(timeout: Duration, cancellation: &'a CancellationToken) -> Result<Self, Error> {
        let deadline = Instant::now()
            .checked_add(timeout)
            .filter(|_| !timeout.is_zero())
            .ok_or(Error::InvalidTimeout)?;
        Ok(Self {
            deadline,
            cancellation,
        })
    }

    pub fn check(&self) -> Result<(), Error> {
        if self.cancellation.is_cancelled() {
            return Err(Error::Cancelled);
        }
        if Instant::now() >= self.deadline {
            return Err(Error::TimedOut);
        }
        Ok(())
    }
}
