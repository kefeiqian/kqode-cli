use super::support::{Fixture, TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{
        CommandExecutor, CommandGateError, RequireApproval, SandboxBackend, SandboxCapability,
        SandboxEnforcement, SandboxProfile, WindowsSandboxBackend,
    },
};
use std::sync::Arc;

#[tokio::test]
async fn native_backend_remains_closed_in_automatic_gate_while_enforcement_is_partial() {
    let fixture = Fixture::new();
    let backend = Arc::new(WindowsSandboxBackend::new(1, 100).unwrap());
    assert_eq!(
        backend
            .capabilities()
            .enforcement(SandboxCapability::ProcessTree),
        SandboxEnforcement::Partial
    );
    assert_eq!(
        backend
            .capabilities()
            .enforcement(SandboxCapability::WorkspaceWriteFilesystem),
        SandboxEnforcement::Partial
    );
    let gate =
        CommandExecutor::new(Arc::new(RequireApproval), Some(backend), None, TEST_TIMEOUT).unwrap();
    let command = fixture.command("exit 0", SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 64);
    let root = command.context().workspace().to_owned();
    assert!(matches!(
        gate.run_snapshot(command, CancellationToken::default())
            .await,
        Err(CommandGateError::UnsupportedCapability {
            enforcement: SandboxEnforcement::Partial,
            ..
        })
    ));
    assert!(!root.exists());
}

#[tokio::test]
async fn cancellation_before_setup_does_not_start_native_process() {
    let fixture = Fixture::new();
    let command = fixture.command("exit 0", SandboxProfile::ReadOnly, TEST_TIMEOUT, 64);
    let root = command.context().workspace().to_owned();
    let cancel = CancellationToken::default();
    cancel.cancel();
    assert!(matches!(
        WindowsSandboxBackend::new(1, 100)
            .unwrap()
            .run_diagnostic(command, cancel)
            .await,
        Err(CommandGateError::Cancelled)
    ));
    assert!(!root.exists());
}

#[test]
fn native_limits_are_explicit_and_diagnostic_future_is_send() {
    assert!(WindowsSandboxBackend::new(0, 100).is_err());
    assert!(WindowsSandboxBackend::new(1, 0).is_err());
    let fixture = Fixture::new();
    let command = fixture.command("exit 0", SandboxProfile::ReadOnly, TEST_TIMEOUT, 64);
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    fn assert_send<T: Send>(_: T) {}
    assert_send(backend.run_diagnostic(command, CancellationToken::default()));
}

#[test]
fn security_environment_cannot_mix_with_explicit_appcontainer_attributes() {
    let security = windows_sys::Win32::Security::SECURITY_CAPABILITIES::default();
    let policy = 1;
    let handle = std::ptr::null_mut();
    let handles = [handle; 3];
    for (security, policy) in [(Some(&security), None), (None, Some(&policy))] {
        let result = super::super::attributes::Attributes::new(
            security,
            &handle,
            &handles,
            policy,
            Some(&handle),
        );
        assert!(matches!(result, Err(error) if error.kind() == std::io::ErrorKind::InvalidInput));
    }
}
