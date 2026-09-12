//! Fail-closed command authorization, separate from platform sandbox enforcement.

mod approval;
mod backend;
mod context;
mod environment;
mod error;
mod executor;
mod permissions;
mod policy;
mod powershell;
mod snapshot_command;
mod snapshot_execution;
#[cfg(windows)]
mod windows_sandbox;
mod workspace;

#[cfg(test)]
mod tests;

pub use approval::{
    ApprovalDecision, ApprovalRequest, ApprovalResponse, CommandApprovalFuture,
    CommandApprovalResponder,
};
pub use backend::{AuthorizedCommand, SandboxBackend, SandboxFuture};
pub use context::{CommandContext, EnvironmentProfile};
pub use error::CommandGateError;
pub use executor::CommandExecutor;
pub use permissions::{
    NetworkPolicy, SandboxCapabilities, SandboxCapability, SandboxEnforcement, SandboxPermissions,
    SandboxProfile,
};
pub use policy::{CommandPolicy, PolicyDecision, RequireApproval};
pub use powershell::PowerShellCommandOptions;
pub use snapshot_command::SnapshotCommand;
pub use snapshot_execution::SnapshotCommandOutput;
#[cfg(windows)]
pub use windows_sandbox::{
    DisabledSandboxAccounts, LpacDiagnosticOutput, LpacTokenObservation, ProtectedSandboxPasswords,
    SandboxAccountCheckpoint, SandboxAccountIdentity, SandboxAccountJournal, SandboxAccountRole,
    SandboxAccountSetupError, WindowsSandboxAccountPlan, WindowsSandboxBackend,
};
pub use workspace::{CommandWorkspace, WorkspaceExecutionMode};
