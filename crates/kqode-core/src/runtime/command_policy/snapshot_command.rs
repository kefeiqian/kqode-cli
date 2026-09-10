use std::fmt;

use super::{
    CommandContext, CommandGateError, PowerShellCommandOptions, SandboxProfile,
    WorkspaceExecutionMode, snapshot_execution::dispose,
};
use crate::runtime::{PowerShell, WorkspacePolicy, WorkspaceSnapshot};

/// Owns the copy used by exactly one prepared dispatch. Cloned context metadata
/// alone cannot keep a copy alive or authorize snapshot execution.
pub struct SnapshotCommand {
    pub(super) context: CommandContext,
    pub(super) snapshot: WorkspaceSnapshot,
}

impl SnapshotCommand {
    /// Maps a source-relative/absolute cwd to the corresponding captured directory.
    ///
    /// Original script and environment values are not rewritten. Absolute paths
    /// inside them retain their meaning and may be refused by the backend.
    /// The copy must be explicitly approved, is not a Git worktree, and is not
    /// automatically published. Missing/excluded cwd, extra host roots and
    /// DangerFullAccess are rejected rather than reinterpreted.
    ///
    /// # Errors
    ///
    /// Returns preparation/path errors and disposes the consumed copy on failure.
    pub fn powershell(
        snapshot: WorkspaceSnapshot,
        shell: &PowerShell,
        script: &str,
        options: PowerShellCommandOptions,
    ) -> Result<Self, CommandGateError> {
        match prepare(&snapshot, shell, script, options) {
            Ok(context) => Ok(Self { context, snapshot }),
            Err(failure) => Err(dispose(snapshot, failure)),
        }
    }

    pub fn context(&self) -> &CommandContext {
        &self.context
    }
}

impl fmt::Debug for SnapshotCommand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SnapshotCommand")
            .field("context", &self.context)
            .finish_non_exhaustive()
    }
}

fn prepare(
    snapshot: &WorkspaceSnapshot,
    shell: &PowerShell,
    script: &str,
    mut options: PowerShellCommandOptions,
) -> Result<CommandContext, CommandGateError> {
    snapshot.validate_location()?;
    if options.permissions.profile == SandboxProfile::DangerFullAccess
        || !options.permissions.extra_roots.is_empty()
    {
        return Err(CommandGateError::InvalidRequest(
            "snapshot execution requires a confined profile without extra host roots",
        ));
    }
    let source = WorkspacePolicy::new(snapshot.source())?;
    if source.root() != snapshot.source() {
        return Err(CommandGateError::SnapshotBindingMismatch);
    }
    let source_cwd = source.resolve_cwd(options.cwd.as_deref())?;
    let relative = source_cwd
        .strip_prefix(source.root())
        .map_err(|_| CommandGateError::SnapshotBindingMismatch)?;
    let execution = WorkspacePolicy::new(snapshot.root())?;
    if execution.root() != snapshot.root() {
        return Err(CommandGateError::SnapshotBindingMismatch);
    }
    options.cwd = Some(relative.to_owned());
    let mut context = CommandContext::powershell(&execution, shell, script, options)?;
    context.bind_snapshot(snapshot, source_cwd);
    Ok(context)
}

pub(super) fn validate_owner(
    context: &CommandContext,
    snapshot: Option<&WorkspaceSnapshot>,
) -> Result<(), CommandGateError> {
    let binding = context.workspace_binding();
    match (binding.mode(), snapshot) {
        (WorkspaceExecutionMode::OriginalWorkspace, None) => Ok(()),
        (WorkspaceExecutionMode::DisposableSnapshot, Some(snapshot))
            if binding.source_root() == snapshot.source()
                && binding.execution_root() == snapshot.root()
                && binding.capture_summary() == Some(snapshot.summary()) =>
        {
            snapshot.validate_location()?;
            Ok(())
        }
        (WorkspaceExecutionMode::DisposableSnapshot, None) => {
            Err(CommandGateError::SnapshotLeaseRequired)
        }
        _ => Err(CommandGateError::SnapshotBindingMismatch),
    }
}
