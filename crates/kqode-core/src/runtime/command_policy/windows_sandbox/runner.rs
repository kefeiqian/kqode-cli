use std::{io, path::Path, sync::Arc};
use tokio::sync::Semaphore;
use windows_sys::Win32::Storage::FileSystem::{
    DELETE, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE,
};

use super::{
    super::{
        AuthorizedCommand, CommandContext, CommandGateError, NetworkPolicy, SandboxBackend,
        SandboxCapabilities, SandboxCapability, SandboxEnforcement, SandboxFuture, SandboxProfile,
        SnapshotCommand, SnapshotCommandOutput, snapshot_command::validate_owner,
        snapshot_execution::dispose_async,
    },
    acl, execution,
    identity::Identity,
    native::TokenObservation,
    pipes::Pipes,
    transport::{command_line, conventional_path},
};
use crate::{
    cancellation::CancellationToken,
    runtime::{ProcessOutput, WorkspaceSnapshot},
};

/// Native LPAC execution implementation, withheld from automatic dispatch while
/// process-tree/filesystem/network enforcement is still only partially validated.
#[derive(Clone)]
pub struct WindowsSandboxBackend {
    permits: Arc<Semaphore>,
    max_workspace_entries: usize,
}

/// Explicit host-side diagnostic results. This does not grant policy approval.
pub struct LpacDiagnosticOutput {
    pub execution: SnapshotCommandOutput,
    pub token: TokenObservation,
}

impl WindowsSandboxBackend {
    /// # Errors
    /// Rejects zero concurrency or workspace-entry limits.
    pub fn new(
        max_concurrent_processes: usize,
        max_workspace_entries: usize,
    ) -> Result<Self, CommandGateError> {
        if max_concurrent_processes == 0 || max_workspace_entries == 0 {
            return Err(CommandGateError::InvalidRequest(
                "native sandbox limits must be positive",
            ));
        }
        Ok(Self {
            permits: Arc::new(Semaphore::new(max_concurrent_processes)),
            max_workspace_entries,
        })
    }

    /// Runs an explicitly host-requested validation command without the approval gate.
    ///
    /// Like the raw ProcessSupervisor, this is not a model/tool entry point.
    /// Always uses LPAC, never an unconfined fallback. Only confined snapshots,
    /// PowerShell 7 transport and denied network are accepted. Missing LPAC token
    /// introspection is reported, not interpreted as complete enforcement.
    /// Cleanup closes Job admission before pinning and joining current descendants.
    /// Already-exiting members and creation in flight at the fence still require
    /// broader lifecycle acceptance, so process-tree enforcement remains partial.
    ///
    /// # Errors
    /// Refuses incompatible contexts or dirty copies (links/reparses), and reports
    /// native launch, capture and cleanup errors. Setup and bounded kill/join use
    /// synchronous Win32 calls; call from a runtime worker, not a UI thread.
    pub async fn run_diagnostic(
        &self,
        command: SnapshotCommand,
        cancellation: CancellationToken,
    ) -> Result<LpacDiagnosticOutput, CommandGateError> {
        let SnapshotCommand { context, snapshot } = command;
        let binding = context.workspace_binding().clone();
        match self.run(&context, &snapshot, &cancellation).await {
            Ok((output, token)) => Ok(LpacDiagnosticOutput {
                execution: SnapshotCommandOutput::new(output, binding, snapshot),
                token,
            }),
            Err(failure) => Err(dispose_async(snapshot, failure).await),
        }
    }

    async fn run(
        &self,
        context: &CommandContext,
        snapshot: &WorkspaceSnapshot,
        cancel: &CancellationToken,
    ) -> Result<(ProcessOutput, TokenObservation), CommandGateError> {
        validate_owner(context, Some(snapshot))?;
        if context.permissions().network != NetworkPolicy::Deny
            || !context.permissions().extra_roots.is_empty()
            || context.permissions().profile == SandboxProfile::DangerFullAccess
            || !Path::new(context.program())
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("pwsh.exe"))
        {
            return Err(CommandGateError::InvalidRequest(
                "native LPAC requires a confined PowerShell 7 snapshot with denied network",
            ));
        }
        command_line(context)
            .map_err(|source| native_error("validate LPAC command transport", source))?;
        conventional_path(context.cwd().as_os_str())
            .map_err(|source| native_error("validate LPAC cwd", source))?;
        let _permit = tokio::select! {
            biased;
            () = cancel.cancelled() => return Err(CommandGateError::Cancelled),
            permit = self.permits.acquire() => permit.map_err(|error| native_error("acquire LPAC process permit", io::Error::other(error)))?,
        };
        let pipes = tokio::select! {
            biased;
            () = cancel.cancelled() => return Err(CommandGateError::Cancelled),
            pipes = Pipes::new() => pipes.map_err(|source| native_error("create LPAC pipes", source))?,
        };
        let files = snapshot.execution_files(self.max_workspace_entries, cancel)?;
        let identity =
            Identity::new().map_err(|source| native_error("create LPAC profile", source))?;
        let mut rights = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE;
        if context.permissions().profile == SandboxProfile::WorkspaceWrite {
            rights |= FILE_GENERIC_WRITE | DELETE;
        }
        acl::grant(
            &files,
            &identity
                .text()
                .map_err(|source| native_error("read LPAC SID", source))?,
            rights,
        )
        .map_err(|source| native_error("grant private-copy access", source))?;
        drop(files);
        if cancel.is_cancelled() {
            return Err(CommandGateError::Cancelled);
        }
        execution::run(context, identity, pipes, cancel).await
    }
}

impl SandboxBackend for WindowsSandboxBackend {
    fn capabilities(&self) -> SandboxCapabilities {
        use SandboxCapability::*;
        SandboxCapabilities::new([
            (ProcessTree, SandboxEnforcement::Partial),
            (SnapshotWorkspace, SandboxEnforcement::Full),
            (ReadOnlyFilesystem, SandboxEnforcement::Partial),
            (WorkspaceWriteFilesystem, SandboxEnforcement::Partial),
            (ProtectedPaths, SandboxEnforcement::Partial),
            (DenyNetwork, SandboxEnforcement::Partial),
        ])
    }
    fn execute<'a>(
        &'a self,
        command: &'a AuthorizedCommand,
        _cancel: &'a CancellationToken,
    ) -> SandboxFuture<'a> {
        Box::pin(async move {
            self.capabilities()
                .validate(command.context().permissions())?;
            Err(CommandGateError::BackendUnavailable)
        })
    }
}

pub(super) fn native_error(operation: &'static str, source: io::Error) -> CommandGateError {
    CommandGateError::NativeSandbox { operation, source }
}
