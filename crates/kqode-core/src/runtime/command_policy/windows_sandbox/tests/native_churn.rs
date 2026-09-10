use super::support::{Fixture, TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{SandboxProfile, WindowsSandboxBackend},
};
use std::{
    fs,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    time::Duration,
};
use windows_sys::Win32::{
    Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject},
};

const PARENT: &str = r#"
$ErrorActionPreference = 'Stop'
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = [Environment]::ProcessPath
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
foreach ($arg in @('-NoProfile','-NonInteractive','-File',[IO.Path]::GetFullPath('spawner.ps1'))) { $info.ArgumentList.Add($arg) }
$children = @([Diagnostics.Process]::Start($info), [Diagnostics.Process]::Start($info))
[IO.File]::WriteAllText('workers', ($children.Id -join ','))
[IO.File]::WriteAllText('ready','ready')
while (-not [IO.File]::Exists('release')) { Start-Sleep -Milliseconds 10 }
exit 0
"#;

const SPAWNER: &str = r#"
$ErrorActionPreference = 'Stop'
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = [Environment]::ProcessPath
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
foreach ($arg in @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Milliseconds 100')) { $info.ArgumentList.Add($arg) }
for ($i = 0; $i -lt 24; $i++) {
    $child = [Diagnostics.Process]::Start($info)
    [IO.File]::WriteAllText("birth-$PID-$i", [string]$child.Id)
    if (-not $child.WaitForExit(10000)) { throw 'leaf exit deadline exceeded' }
    $child.Dispose()
}
Start-Sleep -Seconds 60
"#;

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_stops_concurrent_spawners_on_exit_cancel_timeout_and_drop() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("spawner.ps1"), SPAWNER).unwrap();
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    for finish in ["exit", "cancel", "timeout", "drop"] {
        let timeout = if finish == "timeout" {
            Duration::from_secs(8)
        } else {
            Duration::from_secs(60)
        };
        let command = fixture.command(PARENT, SandboxProfile::WorkspaceWrite, timeout, 128);
        let root = command.context().workspace().to_owned();
        let cancel = CancellationToken::default();
        let mut run = Box::pin(backend.run_diagnostic(command, cancel.clone()));
        let readiness = async {
            loop {
                if root.join("ready").exists() {
                    let workers = fs::read_to_string(root.join("workers")).unwrap();
                    let ids: Vec<_> = workers.split(',').collect();
                    assert_eq!(ids.len(), 2);
                    // Each worker has already replaced a leaf before shutdown begins.
                    if ids
                        .iter()
                        .all(|pid| root.join(format!("birth-{pid}-1")).exists())
                    {
                        break;
                    }
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        };
        tokio::select! {
            result = &mut run => {
                let result = result.expect("native churn setup failed");
                panic!("command ended before churn: {:?}", result.execution.output());
            }
            result = tokio::time::timeout(TEST_TIMEOUT, readiness) => result.expect("churn readiness deadline"),
        }
        let workers: Vec<_> = fs::read_to_string(root.join("workers"))
            .unwrap()
            .split(',')
            .map(|pid| {
                let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid.parse().unwrap()) };
                assert!(!raw.is_null(), "failed to pin a real spawner");
                let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
                assert_eq!(
                    unsafe { WaitForSingleObject(handle.as_raw_handle().cast(), 0) },
                    WAIT_TIMEOUT
                );
                handle
            })
            .collect();
        if finish == "drop" {
            drop(run);
        } else {
            if finish == "cancel" {
                cancel.cancel();
            }
            if finish == "exit" {
                fs::write(root.join("release"), "release").unwrap();
            }
            let result = run.await.unwrap();
            let output = result.execution.output();
            assert_eq!(output.cancelled, finish == "cancel");
            assert_eq!(output.timed_out, finish == "timeout");
            if finish == "exit" {
                assert_eq!(output.exit_code, Some(0));
            }
            let (_, snapshot) = result.execution.into_parts();
            snapshot.close().unwrap();
        }
        for worker in workers {
            assert_eq!(
                unsafe { WaitForSingleObject(worker.as_raw_handle().cast(), 0) },
                WAIT_OBJECT_0,
                "{finish}"
            );
        }
        assert!(!root.exists());
    }
    assert_eq!(
        fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
        "original"
    );
}
