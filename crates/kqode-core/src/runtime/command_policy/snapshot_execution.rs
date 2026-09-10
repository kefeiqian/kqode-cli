use super::{CommandExecutor, CommandGateError, CommandWorkspace, SnapshotCommand};
use crate::{
    cancellation::CancellationToken,
    runtime::{ProcessOutput, WorkspaceSnapshot},
};

/// Completed dispatch plus its owned, unpublished artifacts.
///
/// Nonzero command exits remain ordinary process results. The caller can inspect
/// the copy, then explicitly close it; dropping the result disposes it.
pub struct SnapshotCommandOutput {
    output: ProcessOutput,
    workspace: CommandWorkspace,
    snapshot: WorkspaceSnapshot,
}

impl SnapshotCommandOutput {
    pub fn output(&self) -> &ProcessOutput {
        &self.output
    }
    pub fn workspace(&self) -> &CommandWorkspace {
        &self.workspace
    }
    pub fn snapshot(&self) -> &WorkspaceSnapshot {
        &self.snapshot
    }
    pub fn into_parts(self) -> (ProcessOutput, WorkspaceSnapshot) {
        (self.output, self.snapshot)
    }
}

impl CommandExecutor {
    /// Keeps the prepared copy alive through policy, fresh approval and dispatch.
    ///
    /// # Errors
    ///
    /// On refusal, cancellation or backend infrastructure failure, removes the
    /// copy on a blocking worker. Cleanup errors retain the primary failure.
    /// A dropped future uses the snapshot's synchronous fallback cleanup after
    /// the backend future is dropped; prefer awaiting graceful cancellation.
    /// backends must stop descendants/release handles before releasing their future.
    pub async fn run_snapshot(
        &self,
        command: SnapshotCommand,
        cancellation: CancellationToken,
    ) -> Result<SnapshotCommandOutput, CommandGateError> {
        let SnapshotCommand { context, snapshot } = command;
        let workspace = context.workspace_binding().clone();
        match self.run_inner(context, cancellation, Some(&snapshot)).await {
            Ok(output) => Ok(SnapshotCommandOutput {
                output,
                workspace,
                snapshot,
            }),
            Err(failure) => Err(dispose_async(snapshot, failure).await),
        }
    }
}

pub(super) fn dispose(snapshot: WorkspaceSnapshot, failure: CommandGateError) -> CommandGateError {
    disposal_result(snapshot.close(), failure)
}

async fn dispose_async(snapshot: WorkspaceSnapshot, failure: CommandGateError) -> CommandGateError {
    match tokio::task::spawn_blocking(move || snapshot.close()).await {
        Ok(result) => disposal_result(result, failure),
        Err(cleanup) => CommandGateError::SnapshotCleanupTask {
            failure: Box::new(failure),
            cleanup,
        },
    }
}

fn disposal_result(
    result: Result<(), crate::runtime::SnapshotError>,
    failure: CommandGateError,
) -> CommandGateError {
    match result {
        Ok(()) => failure,
        Err(cleanup) => CommandGateError::SnapshotCleanup {
            failure: Box::new(failure),
            cleanup,
        },
    }
}
