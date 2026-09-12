use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::SandboxAccountSetupError;

/// Intended account purpose, not an assertion that network policy is installed.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
#[repr(u8)]
pub enum SandboxAccountRole {
    Group = 0,
    Offline = 1,
    Online = 2,
}

pub(super) const ROLES: [SandboxAccountRole; 3] = [
    SandboxAccountRole::Group,
    SandboxAccountRole::Offline,
    SandboxAccountRole::Online,
];

/// Immutable, generated local names; callers cannot supply arbitrary SAM targets.
#[derive(Clone, Debug, Serialize)]
pub struct WindowsSandboxAccountPlan {
    installation_id: String,
    group: String,
    offline: String,
    online: String,
    marker: String,
}

impl WindowsSandboxAccountPlan {
    /// Derives local account names from an installation ID retained by the trusted host.
    ///
    /// # Errors
    ///
    /// Rejects the nil ID. Hash collisions never permit adopting existing accounts.
    pub fn new(installation_id: Uuid) -> Result<Self, SandboxAccountSetupError> {
        if installation_id.is_nil() {
            return Err(SandboxAccountSetupError::InvalidPlan);
        }
        let hash = Sha256::digest(installation_id.as_bytes());
        let suffix = format!("{:016x}", u64::from_be_bytes(hash[..8].try_into().unwrap()));
        Ok(Self {
            installation_id: installation_id.to_string(),
            group: format!("KQodeSandbox-{suffix}"),
            offline: format!("kqo-{suffix}"),
            online: format!("kqn-{suffix}"),
            marker: format!("KQode sandbox installation {installation_id}"),
        })
    }

    pub fn installation_id(&self) -> &str {
        &self.installation_id
    }
    pub fn name(&self, role: SandboxAccountRole) -> &str {
        match role {
            SandboxAccountRole::Group => &self.group,
            SandboxAccountRole::Offline => &self.offline,
            SandboxAccountRole::Online => &self.online,
        }
    }
    pub(super) fn marker(&self) -> &str {
        &self.marker
    }
}

/// An observed principal, retained as ownership evidence rather than recovered by name alone.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SandboxAccountIdentity {
    pub(super) role: SandboxAccountRole,
    pub(super) name: String,
    pub(super) sid: String,
}

impl SandboxAccountIdentity {
    pub fn role(&self) -> SandboxAccountRole {
        self.role
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn sid(&self) -> &str {
        &self.sid
    }
}

/// Account preparation only. No account is enabled and no execution capability is granted.
#[derive(Clone, Debug, Serialize)]
pub struct DisabledSandboxAccounts {
    pub(super) identities: Vec<SandboxAccountIdentity>,
}

impl DisabledSandboxAccounts {
    pub fn identities(&self) -> &[SandboxAccountIdentity] {
        &self.identities
    }
}

#[derive(Clone)]
pub(super) struct PrincipalFacts {
    pub identity: SandboxAccountIdentity,
    pub marker: String,
    pub disabled_normal_user: bool,
}
