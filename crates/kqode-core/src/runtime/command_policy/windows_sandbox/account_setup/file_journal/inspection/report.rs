use super::super::super::{SandboxAccountIdentity, SandboxAccountRole};
use serde::Serialize;

/// Describes records only; neither variant asserts the current SAM state or authorizes execution.
/// An incomplete prefix without a pending intent does not prove no later mutation happened.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxAccountJournalState {
    Incomplete,
    PreparedDisabledRecorded,
}

/// A durable intent lacking its completion receipt. Whether the mutation happened is unknown.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum SandboxAccountPendingMutation {
    Create { role: SandboxAccountRole },
    AddMember { role: SandboxAccountRole },
}

/// Non-secret journal observations, not live identity verification or a recovery capability.
#[derive(Clone, Debug, Serialize)]
pub struct SandboxAccountJournalInspection {
    pub(in super::super) state: SandboxAccountJournalState,
    pub(in super::super) record_count: u32,
    pub(in super::super) identities: Vec<SandboxAccountIdentity>,
    pub(in super::super) pending_mutation: Option<SandboxAccountPendingMutation>,
}

impl SandboxAccountJournalInspection {
    pub fn state(&self) -> SandboxAccountJournalState {
        self.state
    }
    pub fn record_count(&self) -> u32 {
        self.record_count
    }
    /// Returns recorded SID receipts only, not evidence that those accounts still exist.
    pub fn identities(&self) -> &[SandboxAccountIdentity] {
        &self.identities
    }
    pub fn pending_mutation(&self) -> Option<SandboxAccountPendingMutation> {
        self.pending_mutation
    }
}
