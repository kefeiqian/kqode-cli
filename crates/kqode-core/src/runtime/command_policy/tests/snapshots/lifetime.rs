use std::{
    fs::{File, OpenOptions},
    os::windows::fs::OpenOptionsExt,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use super::{
    super::{
        super::*,
        support::{FakeBackend, FixedPolicy, Reply, TEST_TIMEOUT, executor, full_capabilities},
    },
    support::Fixture,
};
use crate::cancellation::CancellationToken;
use tokio::sync::Notify;

struct PendingApproval {
    entered: Notify,
}
impl CommandApprovalResponder for PendingApproval {
    fn request<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        _cancel: &'a CancellationToken,
    ) -> CommandApprovalFuture<'a> {
        Box::pin(async move {
            assert!(request.context().workspace().join("src\\file.txt").exists());
            self.entered.notify_one();
            std::future::pending().await
        })
    }
}

#[tokio::test]
async fn copy_is_owned_while_approval_waits_and_disposed_on_cancel_or_future_drop() {
    let fixture = Fixture::new();
    for cancel_explicitly in [true, false] {
        let command = fixture.command();
        let root = command.context().workspace().to_owned();
        let reply = Arc::new(PendingApproval {
            entered: Notify::new(),
        });
        let gate = executor(
            PolicyDecision::Allow,
            Arc::new(FakeBackend::default()),
            Some(reply.clone()),
        );
        let cancel = CancellationToken::default();
        let mut run = Box::pin(gate.run_snapshot(command, cancel.clone()));
        tokio::select! {
            _ = &mut run => panic!("approval unexpectedly completed"),
            () = reply.entered.notified() => {}
        }
        assert!(root.exists());
        if cancel_explicitly {
            cancel.cancel();
            assert!(matches!(run.await, Err(CommandGateError::Cancelled)));
        } else {
            drop(run);
        }
        assert!(!root.exists());
    }
}

struct PendingBackend {
    entered: Notify,
    dropped: AtomicBool,
}
struct HeldFile<'a> {
    _file: File,
    dropped: &'a AtomicBool,
}
impl Drop for HeldFile<'_> {
    fn drop(&mut self) {
        self.dropped.store(true, Ordering::SeqCst);
    }
}
impl SandboxBackend for PendingBackend {
    fn capabilities(&self) -> SandboxCapabilities {
        full_capabilities()
    }
    fn execute<'a>(
        &'a self,
        command: &'a AuthorizedCommand,
        _cancel: &'a CancellationToken,
    ) -> SandboxFuture<'a> {
        Box::pin(async move {
            let file = OpenOptions::new()
                .read(true)
                .share_mode(windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ)
                .open(command.context().workspace().join("src\\file.txt"))
                .unwrap();
            let _guard = HeldFile {
                _file: file,
                dropped: &self.dropped,
            };
            self.entered.notify_one();
            std::future::pending().await
        })
    }
}

#[tokio::test]
async fn backend_future_releases_its_files_before_the_copy_is_disposed() {
    let fixture = Fixture::new();
    for cancel_explicitly in [true, false] {
        let command = fixture.command();
        let root = command.context().workspace().to_owned();
        let backend = Arc::new(PendingBackend {
            entered: Notify::new(),
            dropped: AtomicBool::new(false),
        });
        let gate = CommandExecutor::new(
            Arc::new(FixedPolicy(PolicyDecision::Allow)),
            Some(backend.clone()),
            Some(Arc::new(Reply::approving())),
            TEST_TIMEOUT,
        )
        .unwrap();
        let cancel = CancellationToken::default();
        let mut run = Box::pin(gate.run_snapshot(command, cancel.clone()));
        tokio::select! {
            _ = &mut run => panic!("backend unexpectedly completed"),
            () = backend.entered.notified() => {}
        }
        assert!(root.exists());
        if cancel_explicitly {
            cancel.cancel();
            assert!(matches!(run.await, Err(CommandGateError::Cancelled)));
        } else {
            drop(run);
        }
        assert!(backend.dropped.load(Ordering::SeqCst));
        assert!(!root.exists());
    }
}

#[tokio::test]
async fn cleanup_failure_keeps_the_original_policy_failure() {
    let fixture = Fixture::new();
    let command = fixture.command();
    let root = command.context().workspace().to_owned();
    let held = OpenOptions::new()
        .read(true)
        .share_mode(windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ)
        .open(root.join("src\\file.txt"))
        .unwrap();
    let gate = executor(PolicyDecision::Deny, Arc::new(FakeBackend::default()), None);
    let result = gate
        .run_snapshot(command, CancellationToken::default())
        .await;
    assert!(
        matches!(result, Err(CommandGateError::SnapshotCleanup { failure, .. }) if matches!(*failure, CommandGateError::PolicyDenied))
    );
    drop(held);
    std::fs::remove_dir_all(&root).unwrap();
}
