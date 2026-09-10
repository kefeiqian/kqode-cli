use std::{sync::Arc, time::Duration};

use super::{
    super::{
        super::*,
        support::{FakeBackend, FixedPolicy, Reply, TEST_TIMEOUT, executor, full_capabilities},
    },
    support::Fixture,
};
use crate::{cancellation::CancellationToken, runtime::ProcessError};

struct NoReply;
impl CommandApprovalResponder for NoReply {
    fn request<'a>(
        &'a self,
        _request: &'a ApprovalRequest,
        _cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(std::future::pending())
    }
}

#[tokio::test]
async fn approval_timeout_and_rejection_dispose_the_copy() {
    let fixture = Fixture::new();
    let command = fixture.command();
    let root = command.context().workspace().to_owned();
    let gate = CommandExecutor::new(
        Arc::new(FixedPolicy(PolicyDecision::Allow)),
        Some(Arc::new(FakeBackend::default())),
        Some(Arc::new(NoReply)),
        Duration::from_millis(5),
    )
    .unwrap();
    assert!(matches!(
        gate.run_snapshot(command, CancellationToken::default())
            .await,
        Err(CommandGateError::ApprovalTimedOut)
    ));
    assert!(!root.exists());

    let command = fixture.command();
    let root = command.context().workspace().to_owned();
    let mut reply = Reply::approving();
    reply.decision = ApprovalDecision::Reject;
    let gate = executor(
        PolicyDecision::Allow,
        Arc::new(FakeBackend::default()),
        Some(Arc::new(reply)),
    );
    assert!(matches!(
        gate.run_snapshot(command, CancellationToken::default())
            .await,
        Err(CommandGateError::ApprovalRejected)
    ));
    assert!(!root.exists());
}

struct FailedBackend;
impl SandboxBackend for FailedBackend {
    fn capabilities(&self) -> SandboxCapabilities {
        full_capabilities()
    }
    fn execute<'a>(
        &'a self,
        _command: &'a AuthorizedCommand,
        _cancel: &'a CancellationToken,
    ) -> SandboxFuture<'a> {
        Box::pin(async { Err(ProcessError::InvalidLimit("fixture").into()) })
    }
}

#[tokio::test]
async fn infrastructure_failure_disposes_artifacts_without_masking_the_error() {
    let fixture = Fixture::new();
    let command = fixture.command();
    let root = command.context().workspace().to_owned();
    let gate = CommandExecutor::new(
        Arc::new(FixedPolicy(PolicyDecision::Allow)),
        Some(Arc::new(FailedBackend)),
        Some(Arc::new(Reply::approving())),
        TEST_TIMEOUT,
    )
    .unwrap();
    assert!(matches!(
        gate.run_snapshot(command, CancellationToken::default())
            .await,
        Err(CommandGateError::Backend(ProcessError::InvalidLimit(
            "fixture"
        )))
    ));
    assert!(!root.exists());
}
