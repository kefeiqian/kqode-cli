use std::{collections::BTreeMap, path::PathBuf};

use serde::{Deserialize, Serialize};

use super::CommandGateError;

/// Requested filesystem authority. These values do not themselves enforce it.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxProfile {
    #[default]
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
}

/// Network authority is independent of the filesystem profile.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NetworkPolicy {
    #[default]
    Deny,
    Allow,
}

/// Permissions requested by a trusted adapter before canonicalization and approval.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SandboxPermissions {
    pub profile: SandboxProfile,
    pub network: NetworkPolicy,
    /// Additional host roots; each must be an existing directory and is approval-bound.
    pub extra_roots: Vec<PathBuf>,
}

/// Independently verifiable properties of a platform backend.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxCapability {
    ReadOnlyFilesystem,
    WorkspaceWriteFilesystem,
    ProtectedPaths,
    DenyNetwork,
    ExtraRoots,
    ProcessTree,
    FullAccess,
}

/// Partial isolation must never satisfy a requirement for full enforcement.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxEnforcement {
    #[default]
    Unsupported,
    Partial,
    Full,
}

/// A backend's explicit capability report. Missing entries are unsupported.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SandboxCapabilities(BTreeMap<SandboxCapability, SandboxEnforcement>);

impl SandboxCapabilities {
    /// Constructs a report supplied by a trusted backend, not a model.
    pub fn new(entries: impl IntoIterator<Item = (SandboxCapability, SandboxEnforcement)>) -> Self {
        Self(entries.into_iter().collect())
    }

    pub fn enforcement(&self, capability: SandboxCapability) -> SandboxEnforcement {
        self.0.get(&capability).copied().unwrap_or_default()
    }

    /// Verifies every required capability before asking the user or executing.
    ///
    /// # Errors
    ///
    /// Returns the first unsupported or partially enforced requirement.
    pub fn validate(&self, permissions: &SandboxPermissions) -> Result<(), CommandGateError> {
        let mut required = vec![SandboxCapability::ProcessTree];
        match permissions.profile {
            SandboxProfile::ReadOnly => required.push(SandboxCapability::ReadOnlyFilesystem),
            SandboxProfile::WorkspaceWrite => {
                required.push(SandboxCapability::WorkspaceWriteFilesystem);
                required.push(SandboxCapability::ProtectedPaths);
            }
            SandboxProfile::DangerFullAccess => required.push(SandboxCapability::FullAccess),
        }
        if permissions.network == NetworkPolicy::Deny {
            required.push(SandboxCapability::DenyNetwork);
        }
        if !permissions.extra_roots.is_empty() {
            required.push(SandboxCapability::ExtraRoots);
        }
        for capability in required {
            let enforcement = self.enforcement(capability);
            if enforcement != SandboxEnforcement::Full {
                return Err(CommandGateError::UnsupportedCapability {
                    capability,
                    enforcement,
                });
            }
        }
        Ok(())
    }
}
