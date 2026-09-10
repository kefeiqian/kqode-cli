use std::{sync::Arc, time::Duration};

use super::{
    ApprovalDecision, ApprovalRequest, AuthorizedCommand, CommandApprovalResponder, CommandContext,
    CommandGateError, CommandPolicy, PolicyDecision, SandboxBackend, SandboxCapability,
    SandboxProfile, WorkspaceExecutionMode, snapshot_command::validate_owner,
};
use crate::{
    cancellation::CancellationToken,
    runtime::{ProcessOutput, WorkspaceSnapshot},
};

/// Orders policy, capability checks, fresh approval and sandbox dispatch.
///
/// There is no automatic fallback to `ProcessSupervisor::run` and no approval cache.
pub struct CommandExecutor {
    policy: Arc<dyn CommandPolicy>,
    backend: Option<Arc<dyn SandboxBackend>>,
    approval: Option<Arc<dyn CommandApprovalResponder>>,
    approval_timeout: Duration,
}

impl CommandExecutor {
    /// Creates a gate with an explicitly bounded approval wait.
    ///
    /// # Errors
    ///
    /// Rejects a zero approval timeout instead of allowing an unbounded wait.
    pub fn new(
        policy: Arc<dyn CommandPolicy>,
        backend: Option<Arc<dyn SandboxBackend>>,
        approval: Option<Arc<dyn CommandApprovalResponder>>,
        approval_timeout: Duration,
    ) -> Result<Self, CommandGateError> {
        if approval_timeout.is_zero()
            || std::time::Instant::now()
                .checked_add(approval_timeout)
                .is_none()
        {
            return Err(CommandGateError::InvalidRequest(
                "approval timeout must be positive and representable",
            ));
        }
        Ok(Self {
            policy,
            backend,
            approval,
            approval_timeout,
        })
    }

    /// Executes only after every gate accepts the same immutable launch context.
    ///
    /// # Errors
    ///
    /// Returns typed denial, unavailable/partial backend, missing/rejected/stale
    /// approval, approval timeout, cancellation, or backend execution failure.
    /// DangerFullAccess always requires fresh approval in this first version,
    /// even when ordinary command policy returns Allow.
    /// Snapshot contexts must use `run_snapshot` with their owned copy.
    pub async fn run(
        &self,
        context: CommandContext,
        cancellation: CancellationToken,
    ) -> Result<ProcessOutput, CommandGateError> {
        self.run_inner(context, cancellation, None).await
    }

    pub(super) async fn run_inner(
        &self,
        context: CommandContext,
        cancellation: CancellationToken,
        snapshot: Option<&WorkspaceSnapshot>,
    ) -> Result<ProcessOutput, CommandGateError> {
        if cancellation.is_cancelled() {
            return Err(CommandGateError::Cancelled);
        }
        validate_owner(&context, snapshot)?;
        let verdict = self.policy.evaluate(&context);
        if verdict == PolicyDecision::Deny {
            return Err(CommandGateError::PolicyDenied);
        }
        let backend = self
            .backend
            .as_ref()
            .ok_or(CommandGateError::BackendUnavailable)?;
        validate_capabilities(backend.as_ref(), &context)?;
        let context = Arc::new(context);
        let mut approval_deadline = None;
        if verdict == PolicyDecision::Ask
            || context.permissions().profile == SandboxProfile::DangerFullAccess
            || context.workspace_binding().mode() == WorkspaceExecutionMode::DisposableSnapshot
        {
            let responder = self
                .approval
                .as_ref()
                .ok_or(CommandGateError::ApprovalUnavailable)?;
            let request = ApprovalRequest::new(Arc::clone(&context));
            let deadline = tokio::time::Instant::now()
                .checked_add(self.approval_timeout)
                .ok_or(CommandGateError::InvalidRequest(
                    "approval deadline is not representable",
                ))?;
            approval_deadline = Some(deadline);
            let response = tokio::select! {
                biased;
                () = cancellation.cancelled() => return Err(CommandGateError::Cancelled),
                response = tokio::time::timeout_at(deadline, async {
                    responder.request(&request, &cancellation).await
                }) => response.map_err(|_| CommandGateError::ApprovalTimedOut)??,
            };
            if tokio::time::Instant::now() >= deadline {
                return Err(CommandGateError::ApprovalTimedOut);
            }
            if response.request_id != request.id() {
                return Err(CommandGateError::ApprovalMismatch);
            }
            if response.decision != ApprovalDecision::Approve {
                return Err(CommandGateError::ApprovalRejected);
            }
        }
        if cancellation.is_cancelled() {
            return Err(CommandGateError::Cancelled);
        }
        // Recheck volatile capability availability without ever widening permissions.
        validate_capabilities(backend.as_ref(), &context)?;
        validate_owner(&context, snapshot)?;
        if approval_deadline.is_some_and(|deadline| tokio::time::Instant::now() >= deadline) {
            return Err(CommandGateError::ApprovalTimedOut);
        }

        let command = AuthorizedCommand::new(context);
        tokio::select! {
            biased;
            () = cancellation.cancelled() => Err(CommandGateError::Cancelled),
            result = async { backend.execute(&command, &cancellation).await } => result,
        }
    }
}

fn validate_capabilities(
    backend: &dyn SandboxBackend,
    context: &CommandContext,
) -> Result<(), CommandGateError> {
    let capabilities = backend.capabilities();
    capabilities.validate(context.permissions())?;
    if context.workspace_binding().mode() == WorkspaceExecutionMode::DisposableSnapshot {
        capabilities.require(SandboxCapability::SnapshotWorkspace)?;
    }
    Ok(())
}
