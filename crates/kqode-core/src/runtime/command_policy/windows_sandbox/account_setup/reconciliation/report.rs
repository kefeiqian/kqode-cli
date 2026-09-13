use super::super::{SandboxAccountIdentity, SandboxAccountJournalInspection, SandboxAccountRole};
use serde::Serialize;

/// Stable observations needing explicit review; never instructions to mutate an account.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SandboxAccountDiscrepancy {
    JournalIncomplete,
    MissingRecordedPrincipal { role: SandboxAccountRole },
    UnrecordedPrincipal { role: SandboxAccountRole },
    IdentityMismatch { role: SandboxAccountRole },
    UnsafeUserState { role: SandboxAccountRole },
    MissingRecordedMembership { role: SandboxAccountRole },
    UnrecordedMembership { sid: String },
}

/// Time-limited read observations, not an atomic SAM snapshot, ownership lease or readiness token.
///
/// Even an empty discrepancy list does not verify other group memberships, logon
/// rights, credentials against SAM, filesystem/network policy or execution safety.
#[derive(Clone, Debug, Serialize)]
pub struct SandboxAccountReconciliation {
    pub(super) journal: SandboxAccountJournalInspection,
    pub(super) observed_identities: Vec<SandboxAccountIdentity>,
    pub(super) group_members: Option<Vec<String>>,
    pub(super) discrepancies: Vec<SandboxAccountDiscrepancy>,
}

impl SandboxAccountReconciliation {
    pub fn journal(&self) -> &SandboxAccountJournalInspection {
        &self.journal
    }
    pub fn observed_identities(&self) -> &[SandboxAccountIdentity] {
        &self.observed_identities
    }
    /// `None` means the group was absent or unconfirmed, so membership was not queried.
    pub fn group_members(&self) -> Option<&[String]> {
        self.group_members.as_deref()
    }
    pub fn discrepancies(&self) -> &[SandboxAccountDiscrepancy] {
        &self.discrepancies
    }
}
