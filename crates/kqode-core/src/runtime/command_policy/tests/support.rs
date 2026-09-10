use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use super::super::*;
use crate::{
    cancellation::CancellationToken,
    runtime::{ProcessOutput, ProcessRequest, WorkspacePolicy},
};

pub const TEST_TIMEOUT: Duration = Duration::from_secs(2);

pub fn context() -> CommandContext {
    let workspace = WorkspacePolicy::new(std::env::current_dir().unwrap()).unwrap();
    CommandContext::prepare(
        &workspace,
        "original script",
        request(),
        SandboxPermissions::default(),
    )
    .unwrap()
}

pub fn request() -> ProcessRequest {
    ProcessRequest {
        program: std::env::current_exe().unwrap().into_os_string(),
        arguments: vec!["actual-argument".into()],
        cwd: None,
        environment: BTreeMap::from([("KQODE_TEST_VALUE".into(), "private-value".into())]),
        timeout: TEST_TIMEOUT,
        max_output_bytes: 1024,
    }
}

pub fn full_capabilities() -> SandboxCapabilities {
    use SandboxCapability::*;
    SandboxCapabilities::new(
        [
            ReadOnlyFilesystem,
            WorkspaceWriteFilesystem,
            ProtectedPaths,
            DenyNetwork,
            ExtraRoots,
            ProcessTree,
            FullAccess,
        ]
        .map(|capability| (capability, SandboxEnforcement::Full)),
    )
}

pub struct FixedPolicy(pub PolicyDecision);

impl CommandPolicy for FixedPolicy {
    fn evaluate(&self, _context: &CommandContext) -> PolicyDecision {
        self.0
    }
}

pub struct FakeBackend {
    pub calls: AtomicUsize,
    pub capabilities: Mutex<SandboxCapabilities>,
    pub contexts: Mutex<Vec<CommandContext>>,
}

impl Default for FakeBackend {
    fn default() -> Self {
        Self {
            calls: AtomicUsize::new(0),
            capabilities: Mutex::new(full_capabilities()),
            contexts: Mutex::new(vec![]),
        }
    }
}

impl SandboxBackend for FakeBackend {
    fn capabilities(&self) -> SandboxCapabilities {
        self.capabilities.lock().unwrap().clone()
    }
    fn execute<'a>(
        &'a self,
        command: &'a AuthorizedCommand,
        _cancel: &'a CancellationToken,
    ) -> SandboxFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.contexts
                .lock()
                .unwrap()
                .push(command.context().clone());
            Ok(ProcessOutput {
                exit_code: Some(7),
                signal: None,
                timed_out: false,
                cancelled: false,
                stdout: "result".into(),
                stderr: String::new(),
                truncated: false,
                omitted_bytes: 0,
                duration: Duration::ZERO,
            })
        })
    }
}

pub struct Reply {
    pub calls: AtomicUsize,
    pub decision: ApprovalDecision,
    pub replay: Mutex<Option<ApprovalResponse>>,
    pub observed: Mutex<Vec<CommandContext>>,
}

impl Reply {
    pub fn approving() -> Self {
        Self {
            calls: AtomicUsize::new(0),
            decision: ApprovalDecision::Approve,
            replay: Mutex::new(None),
            observed: Mutex::new(vec![]),
        }
    }
}

impl CommandApprovalResponder for Reply {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        _cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.observed
                .lock()
                .unwrap()
                .push(request.context().clone());
            let mut replay = self.replay.lock().unwrap();
            let response = replay.clone().unwrap_or_else(|| ApprovalResponse {
                request_id: request.id().into(),
                decision: self.decision,
            });
            *replay = Some(response.clone());
            Ok(response)
        })
    }
}

pub fn executor(
    verdict: PolicyDecision,
    backend: Arc<FakeBackend>,
    responder: Option<Arc<dyn CommandApprovalResponder>>,
) -> CommandExecutor {
    CommandExecutor::new(
        Arc::new(FixedPolicy(verdict)),
        Some(backend),
        responder,
        TEST_TIMEOUT,
    )
    .unwrap()
}

pub fn calls(backend: &FakeBackend) -> usize {
    backend.calls.load(Ordering::SeqCst)
}
