use super::fixture::Fixture;
use kqode_core::{
    cancellation::CancellationToken,
    runtime::{
        PowerShell, PowerShellCommandOptions, SandboxPermissions, SandboxProfile, SnapshotCommand,
        WindowsSandboxBackend,
    },
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, error::Error, time::Duration};

pub(super) async fn run(fixture: &Fixture, shell: &PowerShell) -> Result<Value, Box<dyn Error>> {
    let snapshot = super::copy_fixture::capture(fixture)?;
    let scratch = snapshot
        .root()
        .join("scratch")
        .to_string_lossy()
        .into_owned();
    let command = SnapshotCommand::powershell(
        snapshot,
        shell,
        "Write-Output 'native ready'; [Console]::Error.Write('stderr'); exit 7",
        PowerShellCommandOptions {
            cwd: None,
            environment: BTreeMap::from([
                ("TEMP".into(), scratch.clone()),
                ("TMP".into(), scratch),
            ]),
            permissions: SandboxPermissions {
                profile: SandboxProfile::WorkspaceWrite,
                ..Default::default()
            },
            timeout: Duration::from_secs(10),
            max_output_bytes: 1024,
        },
    )?;
    let output = WindowsSandboxBackend::new(1, 100)?
        .run_diagnostic(command, CancellationToken::default())
        .await?;
    let process = output.execution.output();
    if process.exit_code != Some(7)
        || process.stdout.trim() != "native ready"
        || process.stderr != "stderr"
    {
        return Err(format!("unexpected native supervisor result: {process:?}").into());
    }
    let result = json!({
        "native_supervisor_completed": true, "exit_code": process.exit_code,
        "token": output.token, "full_enforcement_claimed": false,
        "source_hardlinks_rejected": true,
    });
    let (_, snapshot) = output.execution.into_parts();
    snapshot.close()?;
    Ok(result)
}
