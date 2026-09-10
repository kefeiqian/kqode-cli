use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use tokio::sync::Notify;

use super::{super::*, support::*};
use crate::{cancellation::CancellationToken, runtime::ProcessError};

struct PendingBackend {
    entered: Notify,
    dropped: AtomicBool,
}

struct Guard<'a>(&'a AtomicBool);
impl Drop for Guard<'_> {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

impl SandboxBackend for PendingBackend {
    fn capabilities(&self) -> SandboxCapabilities {
        full_capabilities()
    }
    fn execute<'a>(
        &'a self,
        _command: &'a AuthorizedCommand,
        _cancel: &'a CancellationToken,
    ) -> SandboxFuture<'a> {
        Box::pin(async move {
            let _guard = Guard(&self.dropped);
            self.entered.notify_one();
            std::future::pending().await
        })
    }
}

#[tokio::test]
async fn cancellation_disposes_the_inflight_backend_future() {
    let backend = Arc::new(PendingBackend {
        entered: Notify::new(),
        dropped: AtomicBool::new(false),
    });
    let gate = CommandExecutor::new(
        Arc::new(FixedPolicy(PolicyDecision::Allow)),
        Some(backend.clone()),
        None,
        TEST_TIMEOUT,
    )
    .unwrap();
    let cancel = CancellationToken::default();
    let run = gate.run(context(), cancel.clone());
    let trigger = async {
        backend.entered.notified().await;
        cancel.cancel();
    };
    let (result, ()) = tokio::time::timeout(TEST_TIMEOUT, async { tokio::join!(run, trigger) })
        .await
        .unwrap();
    assert!(matches!(result, Err(CommandGateError::Cancelled)));
    assert!(backend.dropped.load(Ordering::SeqCst));
}

struct FailingBackend;
impl SandboxBackend for FailingBackend {
    fn capabilities(&self) -> SandboxCapabilities {
        full_capabilities()
    }
    fn execute<'a>(
        &'a self,
        _command: &'a AuthorizedCommand,
        _cancel: &'a CancellationToken,
    ) -> SandboxFuture<'a> {
        Box::pin(async { Err(ProcessError::InvalidLimit("test failure").into()) })
    }
}

#[tokio::test]
async fn backend_failure_is_propagated_without_success_shaped_output() {
    let gate = CommandExecutor::new(
        Arc::new(FixedPolicy(PolicyDecision::Allow)),
        Some(Arc::new(FailingBackend)),
        None,
        TEST_TIMEOUT,
    )
    .unwrap();
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::Backend(ProcessError::InvalidLimit(
            "test failure"
        )))
    ));
}

#[test]
fn approval_deadline_must_be_positive_and_representable() {
    for timeout in [std::time::Duration::ZERO, std::time::Duration::MAX] {
        assert!(matches!(
            CommandExecutor::new(Arc::new(RequireApproval), None, None, timeout),
            Err(CommandGateError::InvalidRequest(_))
        ));
    }
}

struct LateReadyApproval;
impl CommandApprovalResponder for LateReadyApproval {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        _cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(async move {
            // Simulate a non-yielding adapter returning Ready after its deadline.
            std::thread::sleep(std::time::Duration::from_millis(20));
            Ok(ApprovalResponse {
                request_id: request.id().into(),
                decision: ApprovalDecision::Approve,
            })
        })
    }
}

#[tokio::test]
async fn approval_returning_ready_after_deadline_is_expired_not_authorized() {
    let backend = Arc::new(FakeBackend::default());
    let gate = CommandExecutor::new(
        Arc::new(RequireApproval),
        Some(backend.clone()),
        Some(Arc::new(LateReadyApproval)),
        std::time::Duration::from_millis(1),
    )
    .unwrap();
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::ApprovalTimedOut)
    ));
    assert_eq!(calls(&backend), 0);
}
