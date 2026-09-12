use super::{
    super::{ProtectedSandboxPasswords, SandboxAccountCheckpoint, WindowsSandboxAccountPlan},
    progress::{Progress, invalid},
    records::Record,
};
use std::io;

#[derive(Default)]
pub(super) enum Session {
    #[default]
    Fresh,
    Active(Progress),
    Failed,
}

impl Session {
    pub fn begin(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        passwords: &ProtectedSandboxPasswords,
        write: impl FnOnce(&Record<'_>) -> io::Result<()>,
    ) -> io::Result<()> {
        if !matches!(std::mem::replace(self, Self::Failed), Self::Fresh) {
            return Err(invalid());
        }
        write(&Record::begin(plan, passwords))?;
        *self = Self::Active(Progress::new(plan.clone()));
        Ok(())
    }

    /// Poison before attempting storage: partial writes, failed flushes and invalid order are terminal.
    pub fn record(
        &mut self,
        checkpoint: &SandboxAccountCheckpoint,
        write: impl FnOnce(&Record<'_>) -> io::Result<()>,
    ) -> io::Result<()> {
        let Self::Active(progress) = std::mem::replace(self, Self::Failed) else {
            return Err(invalid());
        };
        let next = progress.advance(checkpoint)?;
        write(&Record::checkpoint(next.sequence, checkpoint))?;
        *self = Self::Active(next);
        Ok(())
    }
}
