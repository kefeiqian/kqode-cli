use super::super::{
    SandboxAccountCheckpoint as Checkpoint, SandboxAccountIdentity, SandboxAccountRole as Role,
    WindowsSandboxAccountPlan,
};
use std::io;

enum Expected {
    Creating(Role),
    Created(Role),
    AddingMember(Role),
    MemberAdded(Role),
    Prepared,
    Complete,
}

pub(super) struct Progress {
    plan: WindowsSandboxAccountPlan,
    identities: Vec<SandboxAccountIdentity>,
    expected: Expected,
    pub sequence: u32,
}

impl Progress {
    pub fn new(plan: WindowsSandboxAccountPlan) -> Self {
        Self {
            plan,
            identities: Vec::new(),
            expected: Expected::Creating(Role::Group),
            sequence: 0,
        }
    }

    /// Checks the exact intent/receipt order and installation-bound identity set.
    pub fn advance(mut self, checkpoint: &Checkpoint) -> io::Result<Self> {
        self.expected = match (&self.expected, checkpoint) {
            (Expected::Creating(expected), Checkpoint::Creating { role }) if expected == role => {
                Expected::Created(*role)
            }
            (Expected::Created(expected), Checkpoint::Created { identity })
                if *expected == identity.role()
                    && identity.name() == self.plan.name(*expected)
                    && !identity.sid().is_empty()
                    && !self
                        .identities
                        .iter()
                        .any(|known| known.sid() == identity.sid()) =>
            {
                self.identities.push(identity.clone());
                match expected {
                    Role::Group => Expected::Creating(Role::Offline),
                    Role::Offline => Expected::Creating(Role::Online),
                    Role::Online => Expected::AddingMember(Role::Offline),
                }
            }
            (Expected::AddingMember(expected), Checkpoint::AddingMember { role })
                if expected == role =>
            {
                Expected::MemberAdded(*role)
            }
            (Expected::MemberAdded(expected), Checkpoint::MemberAdded { role })
                if expected == role =>
            {
                match role {
                    Role::Offline => Expected::AddingMember(Role::Online),
                    Role::Online => Expected::Prepared,
                    Role::Group => return Err(invalid()),
                }
            }
            (Expected::Prepared, Checkpoint::PreparedDisabled { identities })
                if identities == &self.identities =>
            {
                Expected::Complete
            }
            _ => return Err(invalid()),
        };
        self.sequence += 1;
        Ok(self)
    }
}

pub(super) fn invalid() -> io::Error {
    io::Error::other(
        "invalid or failed sandbox account journal transition; explicit recovery required",
    )
}
