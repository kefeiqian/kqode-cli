//! Disabled account preparation and read-only inspection, never automatic recovery or execution.

mod credentials;
mod error;
mod file_journal;
mod guard;
mod journal;
mod model;
mod native;
mod private_acl;
mod private_object;
mod protection;
mod reconciliation;
mod store;
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
pub(crate) use store::AccountStoreBoundary;
pub use store::WindowsSandboxAccountStore;
