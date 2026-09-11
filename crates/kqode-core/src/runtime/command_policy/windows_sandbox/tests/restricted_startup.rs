use super::super::{identity::Identity, job::Job, native::verify_token, pipes::Pipes};
use super::{
    private_desktop::Desktop,
    restricted_launch,
    support::{Fixture, TEST_TIMEOUT},
    write_scope::Scope,
};
use crate::{cancellation::CancellationToken, runtime::SandboxProfile};
use std::{os::windows::io::AsRawHandle, time::Duration};
use windows_sys::Win32::{
    Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT},
    Storage::FileSystem::{DELETE, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE},
    System::Threading::{GetExitCodeProcess, ResumeThread, WaitForSingleObject},
};

const CAPTURE_BYTES: usize = 8192;
const PROCESS_JOIN_MS: u32 = 5000;
const WORLD_SID: &str = "S-1-1-0";

#[tokio::test]
#[ignore = "requires Windows LPAC/PowerShell 7; creates a private invisible desktop"]
async fn native_restricted_compatibility_sid_reopens_outside_writes() {
    for world_writable in [false, true] {
        probe(world_writable).await;
    }
}

async fn probe(world_writable: bool) {
    let fixture = Fixture::new();
    super::native_boundaries::grant(&fixture.root, "(RX)");
    super::native_boundaries::grant(&fixture.source, "(RX)");
    super::native_boundaries::grant(&fixture.source.join("input.txt"), "(M)");
    let icacls = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
        .join("System32\\icacls.exe");
    if world_writable {
        let grant = std::process::Command::new(icacls)
            .arg(fixture.source.join("input.txt"))
            .arg("/grant")
            .arg(format!("*{WORLD_SID}:(M)"))
            .output()
            .unwrap();
        assert!(
            grant.status.success(),
            "fixture grant failed: {}",
            String::from_utf8_lossy(&grant.stderr)
        );
    }
    let command = fixture.command(
        "Write-Output 'fixed diagnostic transport'",
        SandboxProfile::WorkspaceWrite,
        TEST_TIMEOUT,
        CAPTURE_BYTES,
    );
    let target = command.snapshot.root().join("scratch\\created.txt");
    let target = target.to_string_lossy();
    let target = target.strip_prefix(r"\\?\").unwrap().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'; Set-Content -LiteralPath '{target}' -Value copy -NoNewline; try {{ Set-Content -LiteralPath $env:KQODE_ORIGINAL_INPUT -Value outside-mutation -NoNewline; Write-Output 'outside-written' }} catch [UnauthorizedAccessException] {{ Write-Output 'outside-denied' }}"
    );
    let mut identity = Identity::new().unwrap();
    let scope = Scope::new(true).unwrap();
    let files = command
        .snapshot
        .execution_files(100, &CancellationToken::default())
        .unwrap();
    scope
        .grant_copy(
            &files,
            &identity.text().unwrap(),
            FILE_GENERIC_READ | FILE_GENERIC_EXECUTE | FILE_GENERIC_WRITE | DELETE,
        )
        .unwrap();
    drop(files);
    let mut desktop = Desktop::new(&identity.text().unwrap(), &scope.sid, false).unwrap();
    let pipes = Pipes::new().await.unwrap();
    let job = Job::new().unwrap();
    let (process, thread) = restricted_launch::launch(
        command.context(),
        &identity,
        &scope,
        Some(&desktop),
        &pipes,
        &job,
        Some(&script),
    )
    .unwrap();
    scope
        .set_child_defaults(&process, &identity.text().unwrap())
        .unwrap();
    verify_token(process.as_raw_handle().cast(), Some(true)).unwrap();
    assert!(
        super::restricted_token_check::contains_scope(&process, &scope.sid).unwrap(),
        "LPAC creation removed the fresh restricting SID"
    );
    assert_ne!(
        unsafe { ResumeThread(thread.as_raw_handle().cast()) },
        u32::MAX
    );
    let readers = pipes.read(CAPTURE_BYTES);
    let finished = tokio::time::timeout(TEST_TIMEOUT, async {
        loop {
            match unsafe { WaitForSingleObject(process.as_raw_handle().cast(), 0) } {
                WAIT_OBJECT_0 => break,
                WAIT_TIMEOUT => tokio::time::sleep(Duration::from_millis(10)).await,
                _ => panic!("process wait failed: {}", std::io::Error::last_os_error()),
            }
        }
    })
    .await;
    job.stop().unwrap();
    assert_eq!(
        unsafe { WaitForSingleObject(process.as_raw_handle().cast(), PROCESS_JOIN_MS) },
        WAIT_OBJECT_0
    );
    let (stdout, stderr) = readers.finish().await.unwrap();
    let mut code = 0;
    assert_ne!(
        unsafe { GetExitCodeProcess(process.as_raw_handle().cast(), &mut code) },
        0
    );
    drop(thread);
    drop(process);
    desktop.close().unwrap();
    identity.close().unwrap();
    assert!(
        finished.is_ok(),
        "restricted startup timed out; exit={code:#x}, stdout={}, stderr={}",
        stdout.text,
        stderr.text
    );
    assert_eq!(
        code, 0,
        "exit={code:#x}, stdout={}, stderr={}",
        stdout.text, stderr.text
    );
    assert_eq!(
        stdout.text.trim(),
        if world_writable {
            "outside-written"
        } else {
            "outside-denied"
        }
    );
    assert_eq!(
        std::fs::read_to_string(command.snapshot.root().join("scratch\\created.txt")).unwrap(),
        "copy"
    );
    assert_eq!(
        std::fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
        if world_writable {
            "outside-mutation"
        } else {
            "original"
        }
    );
}
