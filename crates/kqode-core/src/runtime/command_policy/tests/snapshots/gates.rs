use std::{
    fs,
    sync::{Arc, atomic::Ordering},
};

use super::{
    super::{
        super::*,
        support::{FakeBackend, Reply, calls, executor},
    },
    support::Fixture,
};
use crate::cancellation::CancellationToken;

#[tokio::test]
async fn approval_and_backend_receive_the_same_mapping_and_completed_artifacts_remain_owned() {
    let fixture = Fixture::new();
    let command = fixture.command();
    let expected = command.context().clone();
    let root = expected.workspace().to_owned();
    let backend = Arc::new(FakeBackend::default());
    let reply = Arc::new(Reply::approving());
    let gate = executor(PolicyDecision::Allow, backend.clone(), Some(reply.clone()));
    let result = gate
        .run_snapshot(command, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(reply.calls.load(Ordering::SeqCst), 1);
    assert_eq!(reply.observed.lock().unwrap()[0], expected);
    assert_eq!(backend.contexts.lock().unwrap()[0], expected);
    assert_eq!(result.output().exit_code, Some(7));
    assert_eq!(result.workspace(), expected.workspace_binding());
    assert!(root.exists());
    fs::write(result.snapshot().root().join("src\\file.txt"), "artifact").unwrap();
    assert_eq!(
        fs::read_to_string(fixture.source.join("src\\file.txt")).unwrap(),
        "original"
    );
    let (_, snapshot) = result.into_parts();
    snapshot.close().unwrap();
    assert!(!root.exists());
}

#[tokio::test]
async fn cloned_snapshot_context_is_not_a_launch_lease() {
    let fixture = Fixture::new();
    let command = fixture.command();
    let backend = Arc::new(FakeBackend::default());
    let gate = executor(
        PolicyDecision::Allow,
        backend.clone(),
        Some(Arc::new(Reply::approving())),
    );
    assert!(matches!(
        gate.run(command.context().clone(), CancellationToken::default())
            .await,
        Err(CommandGateError::SnapshotLeaseRequired)
    ));
    assert_eq!(calls(&backend), 0);
    assert!(command.context().workspace().exists());
}

#[tokio::test]
async fn deny_and_missing_approval_never_dispatch_and_remove_the_copy() {
    let fixture = Fixture::new();
    for verdict in [PolicyDecision::Allow, PolicyDecision::Deny] {
        let command = fixture.command();
        let root = command.context().workspace().to_owned();
        let backend = Arc::new(FakeBackend::default());
        let gate = executor(verdict, backend.clone(), None);
        let result = gate
            .run_snapshot(command, CancellationToken::default())
            .await;
        assert!(match verdict {
            PolicyDecision::Deny => matches!(result, Err(CommandGateError::PolicyDenied)),
            _ => matches!(result, Err(CommandGateError::ApprovalUnavailable)),
        });
        assert_eq!(calls(&backend), 0);
        assert!(!root.exists());
    }
}

#[tokio::test]
async fn old_or_partial_backends_cannot_accept_snapshot_contexts() {
    let fixture = Fixture::new();
    for enforcement in [SandboxEnforcement::Unsupported, SandboxEnforcement::Partial] {
        let command = fixture.command();
        let root = command.context().workspace().to_owned();
        let backend = Arc::new(FakeBackend::default());
        use SandboxCapability::*;
        *backend.capabilities.lock().unwrap() = SandboxCapabilities::new([
            (ProcessTree, SandboxEnforcement::Full),
            (WorkspaceWriteFilesystem, SandboxEnforcement::Full),
            (ProtectedPaths, SandboxEnforcement::Full),
            (DenyNetwork, SandboxEnforcement::Full),
            (SnapshotWorkspace, enforcement),
        ]);
        let reply = Arc::new(Reply::approving());
        let gate = executor(PolicyDecision::Allow, backend.clone(), Some(reply.clone()));
        assert!(
            matches!(gate.run_snapshot(command, CancellationToken::default()).await,
            Err(CommandGateError::UnsupportedCapability { capability: SnapshotWorkspace, enforcement: actual }) if actual == enforcement)
        );
        assert_eq!(calls(&backend), 0);
        assert_eq!(reply.calls.load(Ordering::SeqCst), 0);
        assert!(!root.exists());
    }
}

#[tokio::test]
async fn approval_for_one_copy_cannot_be_replayed_on_another_copy() {
    let fixture = Fixture::new();
    let backend = Arc::new(FakeBackend::default());
    let reply = Arc::new(Reply::approving());
    let gate = executor(PolicyDecision::Allow, backend.clone(), Some(reply));
    let first = gate
        .run_snapshot(fixture.command(), CancellationToken::default())
        .await
        .unwrap();
    let second = fixture.command();
    let second_root = second.context().workspace().to_owned();
    assert!(matches!(
        gate.run_snapshot(second, CancellationToken::default())
            .await,
        Err(CommandGateError::ApprovalMismatch)
    ));
    assert_eq!(calls(&backend), 1);
    assert!(first.snapshot().root().exists());
    assert!(!second_root.exists());
}
