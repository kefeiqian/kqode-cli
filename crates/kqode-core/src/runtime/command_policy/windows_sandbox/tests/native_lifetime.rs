use super::support::{Fixture, TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{SandboxProfile, WindowsSandboxBackend},
};
use std::{
    fs,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::Path,
    time::Duration,
};
use windows_sys::Win32::{
    Foundation::WAIT_OBJECT_0,
    System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject},
};

const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = [Environment]::ProcessPath
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
foreach ($arg in @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 60')) { $info.ArgumentList.Add($arg) }
$child = [Diagnostics.Process]::Start($info)
[IO.File]::WriteAllText('child.pid', [string]$child.Id)
[IO.File]::WriteAllText('ready', 'ready')
while (-not [IO.File]::Exists('release')) { Start-Sleep -Milliseconds 10 }
exit 0
"#;

async fn ready(path: &Path) {
    tokio::time::timeout(TEST_TIMEOUT, async {
        while !path.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("native child readiness deadline");
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_joins_descendants_on_exit_cancel_and_dropped_future() {
    let fixture = Fixture::new();
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    for finish in ["exit", "cancel", "drop"].into_iter().cycle().take(9) {
        let command = fixture.command(
            SCRIPT,
            SandboxProfile::WorkspaceWrite,
            Duration::from_secs(60),
            128,
        );
        let root = command.context().workspace().to_owned();
        let cancellation = CancellationToken::default();
        let mut run = Box::pin(backend.run_diagnostic(command, cancellation.clone()));
        tokio::select! {
            result = &mut run => {
                let result = result.expect("native parent exited before readiness");
                panic!("native parent exited before readiness: {:?}", result.execution.output());
            }
            () = async { ready(&root.join("ready")).await } => {}
        }
        let pid = fs::read_to_string(root.join("child.pid"))
            .unwrap()
            .parse::<u32>()
            .unwrap();
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        assert!(
            !handle.is_null(),
            "could not pin the actual descendant process"
        );
        let descendant = unsafe { OwnedHandle::from_raw_handle(handle.cast()) };
        assert_ne!(
            unsafe { WaitForSingleObject(descendant.as_raw_handle().cast(), 0) },
            WAIT_OBJECT_0
        );
        if finish == "drop" {
            drop(run);
            assert!(!root.exists());
        } else {
            if finish == "cancel" {
                cancellation.cancel();
            } else {
                fs::write(root.join("release"), "release").unwrap();
            }
            let result = run.await.unwrap();
            assert_eq!(result.execution.output().cancelled, finish == "cancel");
            assert!(!result.execution.output().timed_out);
            if finish == "exit" {
                assert_eq!(result.execution.output().exit_code, Some(0));
            }
            let (_, snapshot) = result.execution.into_parts();
            snapshot.close().unwrap();
        }
        assert_eq!(
            unsafe { WaitForSingleObject(descendant.as_raw_handle().cast(), 0) },
            WAIT_OBJECT_0,
            "{finish}"
        );
        assert!(!root.exists());
    }
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_cancellation_while_waiting_for_a_permit_never_launches() {
    let fixture = Fixture::new();
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    let first = fixture.command(
        "[IO.File]::WriteAllText('ready','ready'); Start-Sleep -Seconds 60",
        SandboxProfile::WorkspaceWrite,
        Duration::from_secs(60),
        128,
    );
    let first_root = first.context().workspace().to_owned();
    let cancel_first = CancellationToken::default();
    let mut first_run = Box::pin(backend.run_diagnostic(first, cancel_first.clone()));
    tokio::select! {
        result = &mut first_run => { result.unwrap(); panic!("first command ended before readiness"); }
        () = async { ready(&first_root.join("ready")).await } => {}
    }
    let second = fixture.command(
        "throw 'must not launch'",
        SandboxProfile::WorkspaceWrite,
        TEST_TIMEOUT,
        128,
    );
    let second_root = second.context().workspace().to_owned();
    let cancel_second = CancellationToken::default();
    let mut second_run = Box::pin(backend.run_diagnostic(second, cancel_second.clone()));
    tokio::select! {
        _ = &mut second_run => panic!("second command did not wait for the permit"),
        () = tokio::task::yield_now() => {}
    }
    cancel_second.cancel();
    assert!(matches!(
        second_run.await,
        Err(crate::runtime::CommandGateError::Cancelled)
    ));
    assert!(!second_root.exists());
    cancel_first.cancel();
    let result = first_run.await.unwrap();
    assert!(result.execution.output().cancelled);
    let (_, snapshot) = result.execution.into_parts();
    snapshot.close().unwrap();
}
