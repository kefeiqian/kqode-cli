use std::{collections::BTreeMap, error::Error, fs, time::Duration};

use kqode_core::runtime::{
    CommandContext, PowerShell, PowerShellCommandOptions, SandboxPermissions, WorkspacePolicy,
};
use serde_json::{Value, json};

use super::{
    fixture::{Fixture, grant},
    identity::Identity,
    launch,
};

const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$copy = $env:KQODE_PROBE_ROOT
[IO.File]::AppendAllText("$copy\write\alias.txt", 'copy changed')
$result = @{ peer_alias = [IO.File]::ReadAllText("$copy\outside\linked.txt") }
try {
    [IO.File]::AppendAllText($env:KQODE_ORIGINAL_ALIAS, 'must not write')
    $result.source_write_allowed = $true
} catch {
    $e = $_.Exception
    while ($null -ne $e.InnerException) { $e = $e.InnerException }
    $result.source_write_allowed = $false
    $result.source_error = $e.HResult
}
$result | ConvertTo-Json -Compress
"#;
const ACCESS_DENIED_HRESULT: i64 = -2_147_024_891;

/// Uses a fresh identity that has never been granted access to the source fixture.
pub(super) fn run(fixture: &Fixture, shell: &PowerShell) -> Result<Value, Box<dyn Error>> {
    let snapshot = super::copy_fixture::capture(fixture)?;
    let mut identity = Identity::new()?;
    grant(snapshot.root(), &identity.text()?, "(OI)(CI)(M)")?;
    let workspace = WorkspacePolicy::new(snapshot.root())?;
    let root = snapshot
        .root()
        .to_str()
        .ok_or("non-Unicode snapshot path")?;
    let scratch = snapshot.root().join("scratch");
    let original = fixture.root().join("outside\\linked.txt");
    let context = CommandContext::powershell(
        &workspace,
        shell,
        SCRIPT,
        PowerShellCommandOptions {
            cwd: None,
            environment: BTreeMap::from([
                ("KQODE_PROBE_ROOT".into(), root.into()),
                (
                    "KQODE_ORIGINAL_ALIAS".into(),
                    original.to_str().ok_or("non-Unicode source path")?.into(),
                ),
                (
                    "TEMP".into(),
                    scratch.to_str().ok_or("non-Unicode temp path")?.into(),
                ),
                (
                    "TMP".into(),
                    scratch.to_str().ok_or("non-Unicode temp path")?.into(),
                ),
            ]),
            permissions: SandboxPermissions::default(),
            timeout: Duration::from_secs(30),
            max_output_bytes: 32 * 1024,
        },
    )?;
    let output = launch::launch(
        &context,
        &identity,
        Some(true),
        &["registryRead", "lpacInstrumentation"],
        &fixture.root().join("capture"),
    )?;
    if output.timed_out || output.exit_code != 0 {
        return Err(format!("snapshot LPAC launch failed: {}", output.stderr).into());
    }
    let observations: Value = serde_json::from_str(&output.stdout)?;
    let source_unchanged = fs::read_to_string(&original)? == "original";
    let copy_modified =
        fs::read_to_string(snapshot.root().join("write\\alias.txt"))? == "originalcopy changed";
    if !source_unchanged
        || !copy_modified
        || observations["peer_alias"] != "original"
        || observations["source_write_allowed"] != false
        || observations["source_error"] != ACCESS_DENIED_HRESULT
    {
        return Err("snapshot LPAC isolation evidence did not match expectations".into());
    }
    identity.close()?;
    snapshot.close()?;
    Ok(json!({
        "source_unchanged": source_unchanged,
        "copy_modified": copy_modified,
        "source_hardlinks_rejected": true,
        "copied_peer_unchanged": true,
        "direct_source_write_denied": true,
        "profile_removed": true,
        "snapshot_removed": true,
        "production_backend": false,
        "full_enforcement_claimed": false,
    }))
}
