use super::{
    super::{
        acl, descendants,
        identity::Identity,
        pipes::Pipes,
        tests::support::{Fixture, TEST_TIMEOUT},
    },
    NativeProcess,
};
use crate::{cancellation::CancellationToken, runtime::SandboxProfile};
use std::{fs, os::windows::io::AsRawHandle, path::Path, time::Duration};
use windows_sys::Win32::{
    Foundation::{ERROR_NOT_ENOUGH_QUOTA, WAIT_TIMEOUT},
    Storage::FileSystem::{DELETE, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE},
    System::Threading::{GetProcessId, WaitForSingleObject},
};

const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = [Environment]::ProcessPath
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
foreach ($arg in @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 60')) { $info.ArgumentList.Add($arg) }
$children = @([Diagnostics.Process]::Start($info), [Diagnostics.Process]::Start($info))
[IO.File]::WriteAllText('children', ($children.Id -join ','))
[IO.File]::WriteAllText('ready','ready')
while (-not [IO.File]::Exists('attempt')) { Start-Sleep -Milliseconds 10 }
try {
    $extra = [Diagnostics.Process]::Start($info)
    [IO.File]::WriteAllText('admitted', [string]$extra.Id)
} catch {
    [IO.File]::WriteAllText('denied', [string]$_.Exception.GetBaseException().NativeErrorCode)
}
[IO.File]::WriteAllText('attempt-complete','complete')
Start-Sleep -Seconds 60
"#;

async fn ready(child: &NativeProcess, path: &Path) {
    tokio::time::timeout(TEST_TIMEOUT, async {
        while !path.exists() {
            assert_eq!(child.poll().unwrap(), None, "parent exited before marker");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("native admission marker deadline");
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; creates temporary profiles"]
async fn native_lpac_admission_fence_denies_new_children_without_killing_existing_members() {
    let fixture = Fixture::new();
    let command = fixture.command(SCRIPT, SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 128);
    let identity = Identity::new().unwrap();
    let cancel = CancellationToken::default();
    let files = command.snapshot.execution_files(100, &cancel).unwrap();
    acl::grant(
        &files,
        &identity.text().unwrap(),
        FILE_GENERIC_READ | FILE_GENERIC_EXECUTE | FILE_GENERIC_WRITE | DELETE,
    )
    .unwrap();
    drop(files);
    let pipes = Pipes::new().await.unwrap();
    let mut child = NativeProcess::spawn(command.context(), identity, &pipes, &cancel).unwrap();
    let readers = pipes.read(128);
    let root = command.context().workspace();
    ready(&child, &root.join("ready")).await;
    let members = descendants::pin(child.job.raw()).unwrap();
    let mut expected: Vec<u32> = fs::read_to_string(root.join("children"))
        .unwrap()
        .split(',')
        .map(|pid| pid.parse().unwrap())
        .collect();
    assert_eq!(expected.len(), 2);
    expected.push(unsafe { GetProcessId(child.process.as_raw_handle().cast()) });
    let expected_members: Vec<_> = expected
        .iter()
        .map(|pid| {
            members
                .iter()
                .find(|handle| unsafe { GetProcessId(handle.as_raw_handle().cast()) } == *pid)
                .expect("root or explicitly created descendant missing from Job")
        })
        .collect();
    child.job.close_admission().unwrap();
    fs::write(root.join("attempt"), "attempt").unwrap();
    ready(&child, &root.join("attempt-complete")).await;
    assert_eq!(
        fs::read_to_string(root.join("denied")).unwrap(),
        ERROR_NOT_ENOUGH_QUOTA.to_string()
    );
    assert!(!root.join("admitted").exists());
    for member in expected_members {
        assert_eq!(
            unsafe { WaitForSingleObject(member.as_raw_handle().cast(), 0) },
            WAIT_TIMEOUT
        );
    }
    child.close().unwrap();
    descendants::join(&members, std::time::Instant::now()).unwrap();
    readers.finish().await.unwrap();
}
