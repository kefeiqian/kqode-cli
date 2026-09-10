use std::{
    sync::{Arc, atomic::Ordering},
    time::Duration,
};

use super::{super::*, support::*};
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};

#[tokio::test]
async fn rejection_and_full_access_without_fresh_approval_do_not_execute() {
    let backend = Arc::new(FakeBackend::default());
    let mut reply = Reply::approving();
    reply.decision = ApprovalDecision::Reject;
    let gate = executor(PolicyDecision::Ask, backend.clone(), Some(Arc::new(reply)));
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::ApprovalRejected)
    ));
    let workspace = WorkspacePolicy::new(std::env::current_dir().unwrap()).unwrap();
    let context = CommandContext::prepare(
        &workspace,
        "script",
        request(),
        SandboxPermissions {
            profile: SandboxProfile::DangerFullAccess,
            ..Default::default()
        },
    )
    .unwrap();
    let gate = executor(PolicyDecision::Allow, backend.clone(), None);
    assert!(matches!(
        gate.run(context, CancellationToken::default()).await,
        Err(CommandGateError::ApprovalUnavailable)
    ));
    assert_eq!(calls(&backend), 0);
}

struct PendingApproval;
impl CommandApprovalResponder for PendingApproval {
    fn request<'a>(
        &'a self,
        _request: &'a ApprovalRequest,
        _cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(std::future::pending())
    }
}

#[tokio::test]
async fn approval_has_a_deadline_and_obeys_cancellation() {
    let backend = Arc::new(FakeBackend::default());
    let gate = CommandExecutor::new(
        Arc::new(RequireApproval),
        Some(backend.clone()),
        Some(Arc::new(PendingApproval)),
        Duration::from_millis(10),
    )
    .unwrap();
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::ApprovalTimedOut)
    ));
    let cancel = CancellationToken::default();
    let run = gate.run(context(), cancel.clone());
    let trigger = async {
        tokio::task::yield_now().await;
        cancel.cancel();
    };
    let (result, ()) = tokio::join!(run, trigger);
    assert!(matches!(result, Err(CommandGateError::Cancelled)));
    assert_eq!(calls(&backend), 0);
}

struct CancelOnApproval;
impl CommandApprovalResponder for CancelOnApproval {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(async move {
            cancel.cancel();
            Ok(ApprovalResponse {
                request_id: request.id().into(),
                decision: ApprovalDecision::Approve,
            })
        })
    }
}

#[tokio::test]
async fn cancellation_before_policy_or_immediately_after_approval_blocks_launch() {
    let backend = Arc::new(FakeBackend::default());
    let reply = Arc::new(Reply::approving());
    let gate = executor(PolicyDecision::Ask, backend.clone(), Some(reply.clone()));
    let cancel = CancellationToken::default();
    cancel.cancel();
    assert!(matches!(
        gate.run(context(), cancel).await,
        Err(CommandGateError::Cancelled)
    ));
    assert_eq!(reply.calls.load(Ordering::SeqCst), 0);
    let gate = executor(
        PolicyDecision::Ask,
        backend.clone(),
        Some(Arc::new(CancelOnApproval)),
    );
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::Cancelled)
    ));
    assert_eq!(calls(&backend), 0);
}

struct WithdrawCapability(Arc<FakeBackend>);
impl CommandApprovalResponder for WithdrawCapability {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        _cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(async move {
            *self.0.capabilities.lock().unwrap() = SandboxCapabilities::default();
            Ok(ApprovalResponse {
                request_id: request.id().into(),
                decision: ApprovalDecision::Approve,
            })
        })
    }
}

#[tokio::test]
async fn capability_loss_during_approval_is_not_an_unsandboxed_fallback() {
    let backend = Arc::new(FakeBackend::default());
    let gate = executor(
        PolicyDecision::Ask,
        backend.clone(),
        Some(Arc::new(WithdrawCapability(backend.clone()))),
    );
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::UnsupportedCapability { .. })
    ));
    assert_eq!(calls(&backend), 0);
}
