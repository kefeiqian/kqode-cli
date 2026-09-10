use std::{collections::BTreeMap, path::PathBuf, time::Duration};

use super::{CommandContext, CommandGateError, SandboxPermissions};
use crate::runtime::{PowerShell, WorkspacePolicy};

/// Host-controlled launch settings applied before the command context is frozen.
#[derive(Clone)]
pub struct PowerShellCommandOptions {
    pub cwd: Option<PathBuf>,
    pub environment: BTreeMap<String, String>,
    pub permissions: SandboxPermissions,
    pub timeout: Duration,
    pub max_output_bytes: usize,
}

impl CommandContext {
    /// Prepares the actual PowerShell argv from the same original script shown for approval.
    ///
    /// There is no public constructor accepting independent script/argv pairs.
    /// No process is launched and no permission is granted during preparation.
    ///
    /// # Errors
    ///
    /// Rejects unsupported script transport, invalid launch settings, secret-like
    /// environment overrides, and invalid workspace/extra-root paths.
    pub fn powershell(
        workspace: &WorkspacePolicy,
        shell: &PowerShell,
        script: &str,
        options: PowerShellCommandOptions,
    ) -> Result<Self, CommandGateError> {
        let mut request = shell
            .prepare(script, options.timeout, options.max_output_bytes)
            .map_err(CommandGateError::Shell)?;
        request.cwd = options.cwd;
        request.environment = options.environment;
        Self::prepare(workspace, script, request, options.permissions)
    }
}
