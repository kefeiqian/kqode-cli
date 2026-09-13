use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    fmt,
    path::{Path, PathBuf},
    time::Duration,
};

use serde::{Deserialize, Serialize};

use super::{CommandGateError, CommandWorkspace, SandboxPermissions, environment};
use crate::runtime::{ProcessRequest, WorkspacePolicy, WorkspaceSnapshot};

/// Names the environment construction policy; the exact resulting values are also frozen.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvironmentProfile {
    Sanitized,
}

/// Immutable policy/approval input constructed by a trusted shell adapter.
///
/// It binds original script, actual argv, canonical paths, permissions, effective
/// environment and limits. It is intentionally not serializable, and Debug redacts
/// scripts, arguments and environment values. Model input must not supply executable
/// identity or assert that a different argv represents the displayed script.
#[derive(Clone, Eq, PartialEq)]
pub struct CommandContext {
    original_script: String,
    program: PathBuf,
    arguments: Vec<OsString>,
    workspace: CommandWorkspace,
    environment: BTreeMap<OsString, OsString>,
    permissions: SandboxPermissions,
    timeout: Duration,
    max_output_bytes: usize,
}

impl CommandContext {
    /// Freezes an internally prepared request before policy or approval is consulted.
    ///
    /// # Errors
    ///
    /// Rejects blank scripts, invalid limits/executable, invalid or secret overrides,
    /// and noncanonical/outside cwd paths. Extra roots must be existing directories.
    /// On Windows, explicit scopes overlapping private account storage are refused.
    pub(super) fn prepare(
        workspace: &WorkspacePolicy,
        original_script: impl Into<String>,
        request: ProcessRequest,
        mut permissions: SandboxPermissions,
    ) -> Result<Self, CommandGateError> {
        let original_script = original_script.into();
        if original_script.trim().is_empty() {
            return Err(CommandGateError::InvalidRequest("script must not be blank"));
        }
        if request.timeout.is_zero()
            || request.max_output_bytes == 0
            || std::time::Instant::now()
                .checked_add(request.timeout)
                .is_none()
        {
            return Err(CommandGateError::InvalidRequest(
                "limits must be positive and timeout must be representable",
            ));
        }
        if request
            .arguments
            .iter()
            .any(|argument| argument.as_encoded_bytes().contains(&0))
        {
            return Err(CommandGateError::InvalidRequest(
                "arguments must not contain NUL",
            ));
        }
        let program = PathBuf::from(request.program);
        if !program.is_absolute() {
            return Err(CommandGateError::InvalidRequest(
                "executable must be absolute",
            ));
        }
        let program = program
            .canonicalize()
            .map_err(CommandGateError::Executable)?;
        if !program
            .metadata()
            .map_err(CommandGateError::Executable)?
            .is_file()
        {
            return Err(CommandGateError::InvalidRequest(
                "executable must be a file",
            ));
        }
        let cwd = workspace.resolve_cwd(request.cwd.as_deref())?;
        for root in &mut permissions.extra_roots {
            let candidate = if root.is_absolute() {
                root.clone()
            } else {
                workspace.root().join(&*root)
            };
            *root = WorkspacePolicy::new(candidate)?.root().to_owned();
        }
        permissions.extra_roots.sort();
        permissions.extra_roots.dedup();
        let environment = environment::freeze(&request.environment)?;
        let context = Self {
            original_script,
            program,
            arguments: request.arguments,
            workspace: CommandWorkspace::original(workspace.root().to_owned(), cwd),
            environment,
            permissions,
            timeout: request.timeout,
            max_output_bytes: request.max_output_bytes,
        };
        #[cfg(windows)]
        super::protected_paths::prepare(
            &context,
            &crate::cancellation::CancellationToken::default(),
        )?;
        Ok(context)
    }

    pub fn original_script(&self) -> &str {
        &self.original_script
    }
    pub fn program(&self) -> &OsStr {
        self.program.as_os_str()
    }
    pub fn arguments(&self) -> &[OsString] {
        &self.arguments
    }
    pub fn workspace(&self) -> &Path {
        self.workspace.execution_root()
    }
    pub fn cwd(&self) -> &Path {
        self.workspace.execution_cwd()
    }
    pub fn workspace_binding(&self) -> &CommandWorkspace {
        &self.workspace
    }
    pub(super) fn bind_snapshot(&mut self, snapshot: &WorkspaceSnapshot, source_cwd: PathBuf) {
        self.workspace = CommandWorkspace::snapshot(
            snapshot.source().to_owned(),
            source_cwd,
            self.workspace().to_owned(),
            self.cwd().to_owned(),
            snapshot.summary().clone(),
        );
    }
    pub fn environment_profile(&self) -> EnvironmentProfile {
        EnvironmentProfile::Sanitized
    }
    /// Exact sanitized environment. Backends must clear inheritance and use this map,
    /// not reconstruct it from ambient state after approval.
    pub fn environment(&self) -> &BTreeMap<OsString, OsString> {
        &self.environment
    }
    pub fn permissions(&self) -> &SandboxPermissions {
        &self.permissions
    }
    pub fn timeout(&self) -> Duration {
        self.timeout
    }
    pub fn max_output_bytes(&self) -> usize {
        self.max_output_bytes
    }
}

impl fmt::Debug for CommandContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CommandContext")
            .field("program", &self.program)
            .field("workspace", &self.workspace)
            .field("permissions", &self.permissions)
            .field("environment_profile", &self.environment_profile())
            .field("timeout", &self.timeout)
            .field("max_output_bytes", &self.max_output_bytes)
            .finish_non_exhaustive()
    }
}
