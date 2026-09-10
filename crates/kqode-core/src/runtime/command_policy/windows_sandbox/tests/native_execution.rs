use super::support::{Fixture, TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{SandboxProfile, WindowsSandboxBackend},
};
use std::{fs, time::Duration};

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_preserves_unicode_environment_and_nonzero_exit_status() {
    let fixture = Fixture::new();
    let command = fixture.command("[Console]::Write('你好' + $env:KQODE_DIAGNOSTIC_VALUE); [Console]::Error.Write('err'); exit 7",
        SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 128);
    let result = WindowsSandboxBackend::new(1, 100)
        .unwrap()
        .run_diagnostic(command, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(result.execution.output().exit_code, Some(7));
    assert_eq!(result.execution.output().stdout, "你好frozen");
    assert_eq!(result.execution.output().stderr, "err");
    assert!(!result.execution.output().timed_out);
    let (_, snapshot) = result.execution.into_parts();
    snapshot.close().unwrap();
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_output_is_bounded_on_both_streams_with_exact_omission_counts() {
    let fixture = Fixture::new();
    let command = fixture.command("[Console]::Out.Write(('A' * 10000) + 'TAIL'); [Console]::Error.Write(('B' * 10000) + 'ERR')",
        SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 64);
    let result = WindowsSandboxBackend::new(1, 100)
        .unwrap()
        .run_diagnostic(command, CancellationToken::default())
        .await
        .unwrap();
    let output = result.execution.output();
    assert_eq!(output.exit_code, Some(0));
    assert_eq!(output.stdout.len(), 64);
    assert_eq!(output.stderr.len(), 64);
    assert!(output.stdout.ends_with("TAIL"));
    assert!(output.stderr.ends_with("ERR"));
    assert!(output.truncated);
    assert_eq!(output.omitted_bytes, 19879);
    let (_, snapshot) = result.execution.into_parts();
    snapshot.close().unwrap();
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_readonly_denies_writes_and_workspace_write_does_not_change_source() {
    let fixture = Fixture::new();
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    let script = "[Console]::Write([IO.File]::ReadAllText('nested\\data.txt')); try { [IO.File]::WriteAllText('created.txt','bad'); exit 11 } catch [UnauthorizedAccessException] { [Console]::Write(' denied') }";
    let result = backend
        .run_diagnostic(
            fixture.command(script, SandboxProfile::ReadOnly, TEST_TIMEOUT, 128),
            CancellationToken::default(),
        )
        .await
        .unwrap();
    assert_eq!(result.execution.output().exit_code, Some(0));
    assert_eq!(result.execution.output().stdout, "nested denied");
    let (_, snapshot) = result.execution.into_parts();
    snapshot.close().unwrap();
    let script = "[IO.File]::WriteAllText('created.txt','copy'); try { [IO.File]::WriteAllText($env:KQODE_ORIGINAL_INPUT,'bad'); exit 11 } catch [UnauthorizedAccessException] { [Console]::Write('denied') }";
    let result = backend
        .run_diagnostic(
            fixture.command(script, SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 128),
            CancellationToken::default(),
        )
        .await
        .unwrap();
    assert_eq!(result.execution.output().exit_code, Some(0));
    assert_eq!(result.execution.output().stdout, "denied");
    assert_eq!(
        fs::read_to_string(result.execution.snapshot().root().join("created.txt")).unwrap(),
        "copy"
    );
    assert_eq!(
        fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
        "original"
    );
    let (_, snapshot) = result.execution.into_parts();
    snapshot.close().unwrap();
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_timeout_terminates_a_continuously_producing_process() {
    let fixture = Fixture::new();
    let command = fixture.command(
        "while ($true) { [Console]::Write('x') }",
        SandboxProfile::WorkspaceWrite,
        Duration::from_secs(3),
        64,
    );
    let result = WindowsSandboxBackend::new(1, 100)
        .unwrap()
        .run_diagnostic(command, CancellationToken::default())
        .await
        .unwrap();
    assert!(result.execution.output().timed_out);
    assert!(!result.execution.output().cancelled);
    assert!(result.execution.output().truncated);
    assert!(result.execution.output().stdout.len() <= 64);
    let (_, snapshot) = result.execution.into_parts();
    snapshot.close().unwrap();
}
