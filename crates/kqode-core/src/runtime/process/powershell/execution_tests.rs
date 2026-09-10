use std::{fs, time::Duration};

use super::{
    PowerShell,
    test_support::{OUTPUT_LIMIT, TEST_TIMEOUT, Workspace},
};
use crate::{
    cancellation::CancellationToken,
    runtime::{ProcessError, ProcessSupervisor},
};

#[tokio::test]
async fn pipeline_and_redirection_execute_as_native_powershell() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let request = shell.prepare(
        "1..3 | ForEach-Object { $_ * 2 } | Set-Content -LiteralPath 'output.txt'; [Console]::Write((Get-Content -LiteralPath 'output.txt') -join ',')",
        TEST_TIMEOUT, OUTPUT_LIMIT,
    ).unwrap();
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(output.exit_code, Some(0), "{output:?}");
    assert_eq!(output.stdout, "2,4,6", "{output:?}");
    assert!(workspace.0.join("output.txt").is_file());
}

#[tokio::test]
async fn terminating_errors_return_failure_and_text_stderr() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let request = shell
        .prepare("throw 'expected-error'", TEST_TIMEOUT, OUTPUT_LIMIT)
        .unwrap();
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(output.exit_code, Some(1), "{output:?}");
    assert!(output.stderr.contains("expected-error"), "{output:?}");
    assert!(!output.stderr.contains("#< CLIXML"), "{output:?}");
}

#[tokio::test]
async fn leading_using_and_param_statements_remain_valid() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let legacy = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    for shell in [
        PowerShell::resolve(None).unwrap(),
        PowerShell::resolve(Some(&legacy)).unwrap(),
    ] {
        let request = shell.prepare(
            "using namespace System.Text\nparam([string]$value = 'ok')\n[Console]::Write([StringBuilder]::new($value).ToString()); exit 7",
            TEST_TIMEOUT, OUTPUT_LIMIT,
        ).unwrap();
        let output = supervisor
            .run(request, CancellationToken::default())
            .await
            .unwrap();
        assert_eq!(output.exit_code, Some(7), "{output:?}");
        assert_eq!(output.stdout, "ok", "{output:?}");
    }
}

#[tokio::test]
async fn cancellation_waits_for_an_actually_started_powershell() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let request = shell
        .prepare(
            "[System.IO.File]::WriteAllText('started', 'ready'); Start-Sleep -Seconds 30",
            TEST_TIMEOUT,
            OUTPUT_LIMIT,
        )
        .unwrap();
    let cancellation = CancellationToken::default();
    let cancel = cancellation.clone();
    let task = tokio::spawn(async move { supervisor.run(request, cancellation).await });
    tokio::time::timeout(TEST_TIMEOUT, async {
        while !workspace.0.join("started").exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    cancel.cancel();
    let output = task.await.unwrap().unwrap();
    assert!(output.cancelled, "{output:?}");
    assert!(!output.timed_out, "{output:?}");
}

#[tokio::test]
async fn spawn_failure_does_not_fall_back_to_another_shell() {
    let workspace = Workspace::new();
    let executable = workspace.0.join("pwsh.exe");
    fs::write(&executable, "not an executable").unwrap();
    let shell = PowerShell::resolve(Some(&executable)).unwrap();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let request = shell
        .prepare(
            "[System.IO.File]::WriteAllText('must-not-run', 'bad')",
            TEST_TIMEOUT,
            OUTPUT_LIMIT,
        )
        .unwrap();
    assert!(matches!(
        supervisor.run(request, CancellationToken::default()).await,
        Err(ProcessError::Spawn(_)),
    ));
    assert!(!workspace.0.join("must-not-run").exists());
}
