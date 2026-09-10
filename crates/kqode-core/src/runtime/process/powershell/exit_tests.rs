use std::path::PathBuf;

use base64::{Engine, engine::general_purpose::STANDARD};

use super::{
    PowerShell,
    test_support::{OUTPUT_LIMIT, TEST_TIMEOUT, Workspace},
};
use crate::{cancellation::CancellationToken, runtime::ProcessSupervisor};

#[tokio::test]
async fn final_command_status_matches_direct_powershell_on_both_versions() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let legacy = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let cases = [
        ("cmd.exe /d /c exit 7", 1),
        ("Write-Error 'expected-error'", 1),
        ("Get-Item -LiteralPath 'missing-file'", 1),
        ("cmd.exe /d /c exit 7; Write-Output 'ok'", 0),
        ("Write-Error 'expected-error'; Write-Output 'ok'", 0),
        ("return (Get-Item -LiteralPath 'missing-file')", 1),
        ("return 5", 0),
        ("Write-Error 'expected-error'; exit 7", 7),
        ("cmd.exe /d /c exit 7; exit 9", 9),
        ("throw 'expected-error'", 1),
    ];
    for shell in [
        PowerShell::resolve(None).unwrap(),
        PowerShell::resolve(Some(&legacy)).unwrap(),
    ] {
        for (script, expected) in cases {
            let request = shell.prepare(script, TEST_TIMEOUT, OUTPUT_LIMIT).unwrap();
            let mut direct = request.clone();
            let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
            *direct.arguments.last_mut().unwrap() = STANDARD.encode(bytes).into();
            let direct_output = supervisor
                .run(direct, CancellationToken::default())
                .await
                .unwrap();
            let wrapped_output = supervisor
                .run(request, CancellationToken::default())
                .await
                .unwrap();
            assert_eq!(
                direct_output.exit_code,
                Some(expected),
                "{script}: {direct_output:?}"
            );
            assert_eq!(
                wrapped_output.exit_code,
                direct_output.exit_code,
                "{}: {script}: {wrapped_output:?}",
                shell.executable().display(),
            );
        }
    }
}

#[tokio::test]
async fn unsupported_named_blocks_fail_before_executing_their_body() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let request = shell
        .prepare(
            "end { [System.IO.File]::WriteAllText('must-not-run', 'bad') }",
            TEST_TIMEOUT,
            OUTPUT_LIMIT,
        )
        .unwrap();
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(output.exit_code, Some(1), "{output:?}");
    assert!(
        output.stderr.contains("top-level named script blocks"),
        "{output:?}"
    );
    assert!(!workspace.0.join("must-not-run").exists());
}

#[tokio::test]
async fn maximum_supported_script_fits_the_real_windows_command_line() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let script = "#".repeat(super::command::MAX_SCRIPT_UTF16_UNITS);
    let request = shell.prepare(&script, TEST_TIMEOUT, OUTPUT_LIMIT).unwrap();
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(output.exit_code, Some(0), "{output:?}");
}
