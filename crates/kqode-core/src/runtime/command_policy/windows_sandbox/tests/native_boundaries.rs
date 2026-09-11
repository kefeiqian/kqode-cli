use super::support::{Fixture, TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{
        SandboxBackend, SandboxCapability, SandboxEnforcement, SandboxProfile,
        WindowsSandboxBackend,
    },
};
use std::{fs, path::Path, process::Command};

const RESTRICTED_PACKAGES_SID: &str = "S-1-15-2-2";
const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
try {
    [IO.File]::WriteAllText($env:KQODE_ORIGINAL_INPUT, 'outside-mutation')
    [Console]::Write('written')
} catch [UnauthorizedAccessException] {
    [Console]::Write('denied')
}
"#;

pub(super) fn grant(path: &Path, rights: &str) {
    let executable =
        Path::new(&std::env::var_os("SystemRoot").unwrap()).join("System32\\icacls.exe");
    let output = Command::new(executable)
        .arg(path)
        .arg("/grant")
        .arg(format!("*{RESTRICTED_PACKAGES_SID}:{rights}"))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "fixture ACL grant failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[tokio::test]
#[ignore = "requires Windows LPAC and PowerShell 7; modifies only fresh fixture ACLs"]
async fn native_lpac_shared_restricted_package_grants_do_not_justify_full_filesystem_enforcement() {
    let fixture = Fixture::new();
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    for shared in [false, true] {
        if shared {
            grant(&fixture.root, "(RX)");
            grant(&fixture.source, "(RX)");
            grant(&fixture.source.join("input.txt"), "(M)");
        }
        for profile in [SandboxProfile::ReadOnly, SandboxProfile::WorkspaceWrite] {
            fs::write(fixture.source.join("input.txt"), "original").unwrap();
            let result = backend
                .run_diagnostic(
                    fixture.command(SCRIPT, profile, TEST_TIMEOUT, 128),
                    CancellationToken::default(),
                )
                .await
                .unwrap();
            let output = result.execution.output();
            assert_eq!(output.exit_code, Some(0), "{output:?}");
            assert!(!output.timed_out && !output.cancelled && !output.truncated);
            let expected = if shared { "written" } else { "denied" };
            assert_eq!(output.stdout, expected, "{profile:?} shared={shared}");
            assert_eq!(
                fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
                if shared {
                    "outside-mutation"
                } else {
                    "original"
                }
            );
            let capability = if profile == SandboxProfile::ReadOnly {
                SandboxCapability::ReadOnlyFilesystem
            } else {
                SandboxCapability::WorkspaceWriteFilesystem
            };
            assert_ne!(
                backend.capabilities().enforcement(capability),
                SandboxEnforcement::Full
            );
            let (_, snapshot) = result.execution.into_parts();
            snapshot.close().unwrap();
        }
    }
}
