use std::sync::{Arc, atomic::Ordering};

use super::{super::*, support::*};
use crate::cancellation::CancellationToken;

#[tokio::test]
async fn allow_executes_exact_context_once_without_approval_and_preserves_failure_status() {
    let backend = Arc::new(FakeBackend::default());
    let approval = Arc::new(Reply::approving());
    let gate = executor(
        PolicyDecision::Allow,
        backend.clone(),
        Some(approval.clone()),
    );
    let context = context();
    let result = gate
        .run(context.clone(), CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(result.exit_code, Some(7));
    assert_eq!(result.stdout, "result");
    assert_eq!(calls(&backend), 1);
    assert_eq!(approval.calls.load(Ordering::SeqCst), 0);
    assert_eq!(backend.contexts.lock().unwrap()[0], context);
}

#[tokio::test]
async fn deny_cannot_be_overridden_by_approval() {
    let backend = Arc::new(FakeBackend::default());
    let approval = Arc::new(Reply::approving());
    let gate = executor(
        PolicyDecision::Deny,
        backend.clone(),
        Some(approval.clone()),
    );
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::PolicyDenied)
    ));
    assert_eq!(calls(&backend), 0);
    assert_eq!(approval.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn conservative_default_requires_approval_in_headless_mode() {
    let backend = Arc::new(FakeBackend::default());
    let gate = CommandExecutor::new(
        Arc::new(RequireApproval),
        Some(backend.clone()),
        None,
        TEST_TIMEOUT,
    )
    .unwrap();
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::ApprovalUnavailable)
    ));
    assert_eq!(calls(&backend), 0);
}

#[tokio::test]
async fn absent_backend_never_prompts_or_launches() {
    let reply = Arc::new(Reply::approving());
    let gate = CommandExecutor::new(
        Arc::new(RequireApproval),
        None,
        Some(reply.clone()),
        TEST_TIMEOUT,
    )
    .unwrap();
    assert!(matches!(
        gate.run(context(), CancellationToken::default()).await,
        Err(CommandGateError::BackendUnavailable)
    ));
    assert_eq!(reply.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn missing_or_partial_enforcement_cannot_be_approved_away() {
    for enforcement in [SandboxEnforcement::Unsupported, SandboxEnforcement::Partial] {
        let backend = Arc::new(FakeBackend::default());
        *backend.capabilities.lock().unwrap() = SandboxCapabilities::new([
            (SandboxCapability::ProcessTree, SandboxEnforcement::Full),
            (SandboxCapability::ReadOnlyFilesystem, enforcement),
        ]);
        let reply = Arc::new(Reply::approving());
        let gate = executor(PolicyDecision::Ask, backend.clone(), Some(reply.clone()));
        assert!(
            matches!(gate.run(context(), CancellationToken::default()).await,
            Err(CommandGateError::UnsupportedCapability { capability: SandboxCapability::ReadOnlyFilesystem, enforcement: actual }) if actual == enforcement)
        );
        assert_eq!(calls(&backend), 0);
        assert_eq!(reply.calls.load(Ordering::SeqCst), 0);
    }
}

#[test]
fn capability_matrix_keeps_network_and_extra_roots_independent() {
    use SandboxCapability::*;
    for profile in [
        SandboxProfile::ReadOnly,
        SandboxProfile::WorkspaceWrite,
        SandboxProfile::DangerFullAccess,
    ] {
        for network in [NetworkPolicy::Deny, NetworkPolicy::Allow] {
            let mut permissions = SandboxPermissions {
                profile,
                network,
                extra_roots: vec![],
            };
            let filesystem = match profile {
                SandboxProfile::ReadOnly => ReadOnlyFilesystem,
                SandboxProfile::WorkspaceWrite => WorkspaceWriteFilesystem,
                SandboxProfile::DangerFullAccess => FullAccess,
            };
            let mut entries = vec![
                (ProcessTree, SandboxEnforcement::Full),
                (filesystem, SandboxEnforcement::Full),
            ];
            if profile == SandboxProfile::WorkspaceWrite {
                assert!(
                    SandboxCapabilities::new(entries.clone())
                        .validate(&permissions)
                        .is_err()
                );
                entries.push((ProtectedPaths, SandboxEnforcement::Full));
            }
            let without_network = SandboxCapabilities::new(entries.clone());
            assert_eq!(
                without_network.validate(&permissions).is_ok(),
                network == NetworkPolicy::Allow
            );
            entries.push((DenyNetwork, SandboxEnforcement::Full));
            assert!(
                SandboxCapabilities::new(entries.clone())
                    .validate(&permissions)
                    .is_ok()
            );
            permissions
                .extra_roots
                .push(std::env::current_dir().unwrap());
            assert!(matches!(
                SandboxCapabilities::new(entries.clone()).validate(&permissions),
                Err(CommandGateError::UnsupportedCapability {
                    capability: ExtraRoots,
                    ..
                })
            ));
            entries.push((ExtraRoots, SandboxEnforcement::Full));
            assert!(
                SandboxCapabilities::new(entries)
                    .validate(&permissions)
                    .is_ok()
            );
        }
    }
}

#[test]
fn composition_requires_complete_analysis_and_any_denied_segment_wins() {
    use PolicyDecision::*;
    for fully_parsed in [true, false] {
        assert_eq!(
            PolicyDecision::combine(&[Allow, Deny, Ask], fully_parsed),
            Deny
        );
        assert_eq!(PolicyDecision::combine(&[Deny, Allow], fully_parsed), Deny);
        assert_eq!(PolicyDecision::combine(&[Allow, Ask], fully_parsed), Ask);
        assert_eq!(PolicyDecision::combine(&[], fully_parsed), Ask);
    }
    assert_eq!(PolicyDecision::combine(&[Allow, Allow], true), Allow);
    assert_eq!(PolicyDecision::combine(&[Allow, Allow], false), Ask);
}
