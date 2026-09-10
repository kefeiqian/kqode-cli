use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use super::{
    PowerShell, PowerShellError,
    command::ARGUMENTS,
    discovery,
    test_support::{OUTPUT_LIMIT, TEST_TIMEOUT, Workspace},
};
use crate::{cancellation::CancellationToken, runtime::ProcessSupervisor};

#[test]
fn explicit_invalid_executable_never_falls_back() {
    for path in [
        r"pwsh.exe",
        r"C:\Windows\System32\cmd.exe",
        r"C:\Windows\System32\wsl.exe",
    ] {
        assert!(matches!(
            PowerShell::resolve(Some(Path::new(path))),
            Err(PowerShellError::InvalidExecutablePath(_)),
        ));
    }
    let workspace = Workspace::new();
    assert!(PowerShell::resolve(Some(&workspace.0.join("pwsh.exe"))).is_err());
    assert!(matches!(
        discovery::select([]),
        Err(PowerShellError::ExecutableNotFound)
    ));
}

#[test]
fn discovery_preserves_candidate_priority_and_freezes_the_executable() {
    let workspace = Workspace::new();
    let pwsh = workspace.0.join("pwsh.exe");
    let legacy = workspace.0.join("powershell.exe");
    fs::write(&pwsh, "resolution fixture only").unwrap();
    fs::write(&legacy, "resolution fixture only").unwrap();
    assert_eq!(
        discovery::select([
            workspace.0.join("missing").join("pwsh.exe"),
            pwsh.clone(),
            legacy
        ])
        .unwrap(),
        pwsh.canonicalize().unwrap(),
    );
    let shell = PowerShell::resolve(Some(&pwsh)).unwrap();
    let request = shell.prepare("'test'", TEST_TIMEOUT, OUTPUT_LIMIT).unwrap();
    assert_eq!(request.program, shell.executable().as_os_str());
    assert_eq!(request.arguments.len(), ARGUMENTS.len() + 1);
    for (actual, expected) in request.arguments.iter().zip(ARGUMENTS) {
        assert_eq!(actual, expected);
    }
}

#[tokio::test]
async fn native_powershell_executes_through_the_supervisor() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let request = shell.prepare(
        "[Console]::Out.Write('quotes \" remain; $literal | \u{4e2d}\u{6587} \u{1f600}'); [Console]::Error.Write('error'); exit 7",
        TEST_TIMEOUT, OUTPUT_LIMIT,
    ).unwrap();
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(output.exit_code, Some(7), "{output:?}");
    assert_eq!(
        output.stdout, "quotes \" remain; $literal | \u{4e2d}\u{6587} \u{1f600}",
        "{output:?}"
    );
    assert_eq!(output.stderr, "error", "{output:?}");
}

#[tokio::test]
async fn windows_powershell_51_works_with_the_filtered_environment() {
    let legacy = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let shell = PowerShell::resolve(Some(&legacy)).unwrap();
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let mut request = shell.prepare(
        "[Console]::Out.Write([Environment]::CurrentDirectory); [Console]::Error.Write('\u{4e2d}\u{6587}'); exit 0",
        TEST_TIMEOUT, OUTPUT_LIMIT,
    ).unwrap();
    fs::create_dir(workspace.0.join("nested")).unwrap();
    request.cwd = Some("nested".into());
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert_eq!(output.exit_code, Some(0), "{output:?}");
    assert_eq!(output.stderr, "\u{4e2d}\u{6587}", "{output:?}");
    assert_eq!(
        PathBuf::from(output.stdout).canonicalize().unwrap(),
        workspace.0.join("nested").canonicalize().unwrap(),
    );
}

#[tokio::test]
async fn native_powershell_timeout_is_supervised() {
    let workspace = Workspace::new();
    let supervisor = ProcessSupervisor::new(&workspace.0, 1).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let request = shell
        .prepare(
            "Start-Sleep -Seconds 30",
            Duration::from_millis(250),
            OUTPUT_LIMIT,
        )
        .unwrap();
    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();
    assert!(output.timed_out, "{output:?}");
}
