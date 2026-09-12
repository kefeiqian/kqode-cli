use serde::Serialize;
use std::io;

use super::{
    ProtectedSandboxPasswords, SandboxAccountIdentity, SandboxAccountRole,
    WindowsSandboxAccountPlan,
};

/// Write-ahead intent and observed completion records; an intent may require manual recovery.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "stage", rename_all = "snake_case")]
pub enum SandboxAccountCheckpoint {
    Creating {
        role: SandboxAccountRole,
    },
    Created {
        identity: SandboxAccountIdentity,
    },
    AddingMember {
        role: SandboxAccountRole,
    },
    MemberAdded {
        role: SandboxAccountRole,
    },
    PreparedDisabled {
        identities: Vec<SandboxAccountIdentity>,
    },
}

/// Trusted host persistence, never a model-supplied implementation.
///
/// Implementations must create a new installation journal, reject existing/reparse
/// targets, restrict it to the authorized owner/SYSTEM (excluding sandbox accounts),
/// and durably flush every record before returning. DPAPI machine protection alone
/// does not make a world-readable journal safe. `PrivateSandboxAccountJournal`
/// provides first-write-only storage and strict read-only inspection. Live SAM
/// reconciliation, explicit recovery and an authorized privileged helper remain
/// required before production setup.
pub trait SandboxAccountJournal {
    /// Durably stores the immutable plan and encrypted passwords before SAM mutations.
    ///
    /// # Errors
    ///
    /// Rejects existing state and any private/durable storage failure.
    fn begin(
        &mut self,
        plan: &WindowsSandboxAccountPlan,
        passwords: &ProtectedSandboxPasswords,
    ) -> io::Result<()>;

    /// Durably records an intent or result without plaintext credentials.
    ///
    /// # Errors
    ///
    /// Returns any storage failure; the workflow will stop instead of continuing.
    fn record(&mut self, checkpoint: &SandboxAccountCheckpoint) -> io::Result<()>;
}
