use std::time::Instant;

use super::{SnapshotError, SnapshotLimits};
use crate::cancellation::CancellationToken;

const MAX_SUPPORTED_DEPTH: usize = 64;

/// Shared cooperative limits for capture and read-only artifact inspection.
pub(super) struct Budget<'a> {
    pub limits: SnapshotLimits,
    pub entries: usize,
    pub bytes: u64,
    cancellation: &'a CancellationToken,
    deadline: Instant,
}

impl<'a> Budget<'a> {
    pub fn new(
        limits: SnapshotLimits,
        cancellation: &'a CancellationToken,
    ) -> Result<Self, SnapshotError> {
        if limits.max_entries == 0 {
            return Err(SnapshotError::InvalidLimit("max_entries"));
        }
        if limits.max_bytes == 0 {
            return Err(SnapshotError::InvalidLimit("max_bytes"));
        }
        if limits.max_depth == 0 || limits.max_depth > MAX_SUPPORTED_DEPTH {
            return Err(SnapshotError::InvalidLimit("max_depth (1..=64)"));
        }
        let deadline = Instant::now()
            .checked_add(limits.timeout)
            .filter(|_| !limits.timeout.is_zero())
            .ok_or(SnapshotError::InvalidLimit("timeout"))?;
        let budget = Self {
            limits,
            entries: 0,
            bytes: 0,
            cancellation,
            deadline,
        };
        budget.check()?;
        Ok(budget)
    }

    pub fn check(&self) -> Result<(), SnapshotError> {
        if self.cancellation.is_cancelled() {
            return Err(SnapshotError::Cancelled);
        }
        if Instant::now() >= self.deadline {
            return Err(SnapshotError::LimitExceeded("timeout"));
        }
        Ok(())
    }

    pub fn entry(&mut self) -> Result<(), SnapshotError> {
        self.check()?;
        if self.entries >= self.limits.max_entries {
            return Err(SnapshotError::LimitExceeded("max_entries"));
        }
        self.entries += 1;
        Ok(())
    }

    pub fn remaining_bytes(&self) -> u64 {
        self.limits.max_bytes - self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::workspace_snapshot::tests::support::limits;

    #[test]
    fn elapsed_inspection_budget_and_later_cancellation_are_checked() {
        let cancellation = CancellationToken::default();
        let mut budget = Budget::new(limits(), &cancellation).unwrap();
        budget.deadline = Instant::now();
        assert!(matches!(
            budget.check(),
            Err(SnapshotError::LimitExceeded("timeout"))
        ));
        let budget = Budget::new(limits(), &cancellation).unwrap();
        cancellation.cancel();
        assert!(matches!(budget.check(), Err(SnapshotError::Cancelled)));
    }
}
