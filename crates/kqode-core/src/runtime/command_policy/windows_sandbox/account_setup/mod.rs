//! First-time provisioning only: dedicated identities stay disabled until later setup gates.

mod credentials;
mod error;
mod file_journal;
mod journal;
mod model;
mod native;
mod protection;
#[cfg(test)]
mod tests;
mod workflow;

pub use credentials::ProtectedSandboxPasswords;
pub use error::SandboxAccountSetupError;
pub use file_journal::PrivateSandboxAccountJournal;
pub use journal::{SandboxAccountCheckpoint, SandboxAccountJournal};
pub use model::{
    DisabledSandboxAccounts, SandboxAccountIdentity, SandboxAccountRole, WindowsSandboxAccountPlan,
};
