use std::{path::PathBuf, sync::Arc, time::Duration};

use super::{super::*, support::*};
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("kqode-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(root.join("child")).unwrap();
        std::fs::write(root.join("alternate.exe"), b"not executed").unwrap();
        Self(root)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

#[tokio::test]
async fn fresh_approval_dispatches_the_exact_snapshot_but_cannot_be_replayed() {
    let backend = Arc::new(FakeBackend::default());
    let reply = Arc::new(Reply::approving());
    let gate = executor(PolicyDecision::Ask, backend.clone(), Some(reply.clone()));
    let original = context();
    gate.run(original.clone(), CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(reply.observed.lock().unwrap()[0], original);
    assert_eq!(backend.contexts.lock().unwrap()[0], original);
    assert!(matches!(
        gate.run(original, CancellationToken::default()).await,
        Err(CommandGateError::ApprovalMismatch)
    ));
    assert_eq!(calls(&backend), 1);
}

#[tokio::test]
async fn each_changed_launch_field_requires_its_own_fresh_challenge() {
    let fixture = Fixture::new();
    let workspace = WorkspacePolicy::new(&fixture.0).unwrap();
    let backend = Arc::new(FakeBackend::default());
    let reply = Arc::new(Reply::approving());
    let gate = executor(PolicyDecision::Ask, backend.clone(), Some(reply));
    let original = CommandContext::prepare(
        &workspace,
        "original script",
        request(),
        SandboxPermissions::default(),
    )
    .unwrap();
    gate.run(original.clone(), CancellationToken::default())
        .await
        .unwrap();
    for variant in 0..11 {
        let mut request = request();
        let mut permissions = SandboxPermissions::default();
        let mut script = "original script";
        let mut workspace = workspace.clone();
        match variant {
            0 => script = "different script",
            1 => request.arguments.push("different argv".into()),
            2 => request.cwd = Some(fixture.0.join("child")),
            3 => permissions.profile = SandboxProfile::WorkspaceWrite,
            4 => permissions.network = NetworkPolicy::Allow,
            5 => {
                request
                    .environment
                    .insert("KQODE_TEST_VALUE".into(), "different value".into());
            }
            6 => permissions.extra_roots.push(fixture.0.join("child")),
            7 => request.timeout += Duration::from_secs(1),
            8 => request.max_output_bytes += 1,
            9 => request.program = fixture.0.join("alternate.exe").into_os_string(),
            10 => workspace = WorkspacePolicy::new(fixture.0.join("child")).unwrap(),
            _ => unreachable!(),
        }
        let changed = CommandContext::prepare(&workspace, script, request, permissions).unwrap();
        assert_ne!(changed, original, "variant {variant}");
        assert!(
            matches!(
                gate.run(changed, CancellationToken::default()).await,
                Err(CommandGateError::ApprovalMismatch)
            ),
            "variant {variant}"
        );
    }
    assert_eq!(calls(&backend), 1);
}
