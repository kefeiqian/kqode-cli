mod attributes;
mod capabilities;
mod fixture;
mod identity;
mod launch;
mod native;
mod network;
mod observation;
mod snapshot;
mod transport;

use std::{collections::BTreeMap, error::Error, path::PathBuf, time::Duration};

use kqode_core::runtime::{
    CommandContext, PowerShell, PowerShellCommandOptions, SandboxPermissions, WorkspacePolicy,
};
use serde_json::json;

use fixture::Fixture;
use identity::Identity;

pub fn run() -> Result<(), Box<dyn Error>> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let snapshot_only = arguments.len() == 1 && arguments[0] == "--snapshot-only";
    if !arguments.is_empty() && !snapshot_only {
        return Err("expected no arguments or --snapshot-only".into());
    }
    let mut identity = Identity::new()?;
    let fixture = Fixture::new(&identity.text()?)?;
    if snapshot_only {
        let result = snapshot::run(&fixture, &PowerShell::resolve(None)?)?;
        identity.close()?;
        fixture.close()?;
        println!("{}", serde_json::to_string_pretty(&result)?);
        return Ok(());
    }
    let workspace = WorkspacePolicy::new(fixture.root())?;
    let mut reports = Vec::new();
    let system_root = std::env::var_os("SystemRoot").ok_or("SystemRoot unavailable")?;
    let shells = [
        PowerShell::resolve(None)?,
        PowerShell::resolve(Some(
            &PathBuf::from(system_root).join("System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
        ))?,
    ];
    for shell in shells {
        for (isolation, capability_names) in [
            (None, &[][..]),
            (Some(false), &[][..]),
            (Some(true), &[][..]),
            (Some(true), &["registryRead", "lpacInstrumentation"][..]),
        ] {
            fixture.reset()?;
            let network = network::Network::new()?;
            let context = CommandContext::powershell(
                &workspace,
                &shell,
                include_str!("checks.ps1"),
                PowerShellCommandOptions {
                    cwd: None,
                    environment: BTreeMap::from([
                        (
                            "KQODE_PROBE_ROOT".into(),
                            fixture
                                .root()
                                .to_str()
                                .ok_or("non-Unicode probe path")?
                                .into(),
                        ),
                        (
                            "KQODE_PROBE_TCP_PORT".into(),
                            network.tcp_port()?.to_string(),
                        ),
                        (
                            "KQODE_PROBE_UDP_PORT".into(),
                            network.udp_port()?.to_string(),
                        ),
                        (
                            "TEMP".into(),
                            fixture
                                .root()
                                .join("scratch")
                                .to_str()
                                .ok_or("non-Unicode temp path")?
                                .into(),
                        ),
                        (
                            "TMP".into(),
                            fixture
                                .root()
                                .join("scratch")
                                .to_str()
                                .ok_or("non-Unicode temp path")?
                                .into(),
                        ),
                    ]),
                    permissions: SandboxPermissions::default(),
                    timeout: Duration::from_secs(30),
                    max_output_bytes: 32 * 1024,
                },
            )?;
            let result = launch::launch(
                &context,
                &identity,
                isolation,
                capability_names,
                &fixture.root().join("capture"),
            );
            let mode = match isolation {
                None => "unconfined_control",
                Some(false) => "appcontainer",
                Some(true) => "lpac",
            };
            let report = match result {
                Ok(output) => json!({
                    "shell": shell.executable(), "mode": mode, "capabilities": capability_names,
                    "observations": observation::parse(&output),
                    "network_received": network.observe()?, "launch": output,
                    "outside_hardlink_changed": fixture.outside_alias_changed()?,
                }),
                Err(error) => json!({
                    "shell": shell.executable(), "mode": mode, "capabilities": capability_names,
                    "launch_error": error.to_string(), "os_error": error.raw_os_error(),
                }),
            };
            reports.push(report);
        }
    }
    let evidence = observation::verify_preferred(&reports);
    let snapshot_evidence = snapshot::run(&fixture, &PowerShell::resolve(None)?)?;
    identity.close()?;
    fixture.close()?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "production_backend": false,
            "full_enforcement_claimed": false,
            "fixture_removed": true,
            "profile_removed": true,
            "preferred_evidence_complete": evidence.is_ok(),
            "snapshot_evidence": snapshot_evidence,
            "reports": reports,
        }))?
    );
    evidence?;
    Ok(())
}
