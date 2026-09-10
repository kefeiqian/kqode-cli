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
