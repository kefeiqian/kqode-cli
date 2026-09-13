//! Disabled account preparation and read-only inspection, never automatic recovery or execution.

mod credentials;
mod error;
mod file_journal;
mod guard;
mod journal;
mod model;
mod native;
mod protection;
mod reconciliation;
#[cfg(test)]
mod tests;
mod workflow;

pub use credentials::ProtectedSandboxPasswords;
pub use error::SandboxAccountSetupError;
pub use file_journal::{
    PrivateSandboxAccountJournal, SandboxAccountJournalInspection, SandboxAccountJournalState,
    SandboxAccountPendingMutation,
};
pub use journal::{SandboxAccountCheckpoint, SandboxAccountJournal};
pub use model::{
    DisabledSandboxAccounts, SandboxAccountIdentity, SandboxAccountRole, WindowsSandboxAccountPlan,
};
pub use reconciliation::{SandboxAccountDiscrepancy, SandboxAccountReconciliation};
