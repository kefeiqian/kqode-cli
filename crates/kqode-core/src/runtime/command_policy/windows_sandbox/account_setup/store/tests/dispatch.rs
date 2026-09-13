use super::super::super::file_journal::tests::boundaries::junction;
use super::super::known_folder;
use super::{selection::request, support::*};
use crate::runtime::{
    ApprovalDecision, ApprovalRequest, ApprovalResponse, CommandApprovalFuture,
    CommandApprovalResponder, CommandContext, CommandGateError, PolicyDecision, SandboxPermissions,
    WorkspacePolicy,
    command_policy::tests::support::{FakeBackend, calls, executor},
};
use std::{fs, path::PathBuf, sync::Arc};

struct ReplaceDuringApproval {
    source: PathBuf,
    moved: PathBuf,
    target: PathBuf,
}

impl CommandApprovalResponder for ReplaceDuringApproval {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        _: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(async move {
            fs::rename(&self.source, &self.moved).unwrap();
            junction(&self.source, &self.target);
            Ok(ApprovalResponse {
                request_id: request.id().into(),
                decision: ApprovalDecision::Approve,
            })
        })
    }
}

#[tokio::test]
async fn approval_cannot_dispatch_after_scope_is_replaced_by_protected_alias() {
    for intermediate in [false, true] {
        let fixture = Fixture::new();
        let source = fixture.0.join("source");
        fs::create_dir(&source).unwrap();
        let local = known_folder::local_app_data().unwrap();
        let (workspace, target) = if intermediate {
            let workspace = source.join(local.file_name().unwrap());
            fs::create_dir(&workspace).unwrap();
            (workspace, local.parent().unwrap().to_owned())
        } else {
            (source.clone(), local)
        };
        let context = CommandContext::prepare(
            &WorkspacePolicy::new(&workspace).unwrap(),
            "fixture",
            request(),
            SandboxPermissions::default(),
        )
        .unwrap();
        let backend = Arc::new(FakeBackend::default());
        let responder = Arc::new(ReplaceDuringApproval {
            source: source.clone(),
            moved: fixture.0.join("moved"),
            target,
        });
        let gate = executor(PolicyDecision::Ask, backend.clone(), Some(responder));
        let result = gate.run(context, CancellationToken::default()).await;
        if intermediate {
            assert!(matches!(
                result,
                Err(CommandGateError::AccountStorage(
                    Error::ProtectedStorageOverlap
                ))
            ));
        } else {
            assert!(matches!(
                result,
                Err(CommandGateError::NativeSandbox { .. })
            ));
        }
        assert_eq!(calls(&backend), 0);
        fs::remove_dir(&source).unwrap();
    }
}
