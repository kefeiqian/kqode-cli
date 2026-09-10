use std::{collections::BTreeMap, io};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::launch::LaunchOutput;

const CHECK_NAMES: &[&str] = &[
    "read_granted",
    "write_readonly",
    "write_granted",
    "write_outside",
    "write_all_packages",
    "write_hardlink",
    "tcp_loopback",
    "udp_loopback",
];
const ACCESS_DENIED_HRESULT: i64 = -2_147_024_891;
const SOCKET_ACCESS_DENIED: i32 = 10013;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Check {
    allowed: bool,
    error: Option<String>,
    code: Option<i64>,
    native_error: Option<i32>,
}

fn decode(text: &str) -> Result<BTreeMap<String, Check>, String> {
    let checks: BTreeMap<String, Check> =
        serde_json::from_str(text).map_err(|error| error.to_string())?;
    if checks.len() != CHECK_NAMES.len()
        || !CHECK_NAMES.iter().all(|name| checks.contains_key(*name))
    {
        return Err("missing or unexpected observation names".into());
    }
    Ok(checks)
}

/// Failed startup, timeouts and malformed output are inconclusive, never denials.
pub(super) fn parse(output: &LaunchOutput) -> Value {
    if output.timed_out || output.exit_code != 0 {
        return json!({ "status": "inconclusive", "reason": "process failed or timed out" });
    }
    match decode(&output.stdout) {
        Ok(checks) => json!({ "status": "complete", "checks": checks }),
        Err(reason) => json!({ "status": "inconclusive", "reason": reason }),
    }
}

/// Checks the preferred shell's control and counterexamples, not full U5 acceptance.
pub(super) fn verify_preferred(reports: &[Value]) -> io::Result<()> {
    let control = reports
        .first()
        .ok_or_else(|| io::Error::other("missing control"))?;
    let appcontainer = reports
        .get(1)
        .ok_or_else(|| io::Error::other("missing AppContainer"))?;
    let lpac = reports
        .get(3)
        .ok_or_else(|| io::Error::other("missing supported LPAC"))?;
    for (report, isolated) in [(control, false), (appcontainer, true), (lpac, true)] {
        if report["observations"]["status"] != "complete" {
            return Err(io::Error::other(
                "preferred-shell comparison is incomplete; see JSON diagnostics",
            ));
        }
        let checks: BTreeMap<String, Check> =
            serde_json::from_value(report["observations"]["checks"].clone())
                .map_err(io::Error::other)?;
        for name in ["read_granted", "write_granted", "write_hardlink"] {
            if !checks[name].allowed {
                return Err(io::Error::other(format!("positive probe failed: {name}")));
            }
        }
        for name in ["write_readonly", "write_outside"] {
            if checks[name].allowed == isolated
                || (isolated && checks[name].code != Some(ACCESS_DENIED_HRESULT))
            {
                return Err(io::Error::other(format!(
                    "unexpected filesystem result: {name}"
                )));
            }
        }
        if report["outside_hardlink_changed"] != true {
            return Err(io::Error::other("hardlink counterexample was not observed"));
        }
    }
    if control["network_received"]["tcp"] != true || control["network_received"]["udp"] != true {
        return Err(io::Error::other(
            "loopback control did not reach the listeners",
        ));
    }
    if appcontainer["observations"]["checks"]["write_all_packages"]["allowed"] != true {
        return Err(io::Error::other(
            "shared-package AppContainer counterexample was not observed",
        ));
    }
    let checks: BTreeMap<String, Check> =
        serde_json::from_value(lpac["observations"]["checks"].clone()).map_err(io::Error::other)?;
    if checks["write_all_packages"].allowed
        || checks["write_all_packages"].code != Some(ACCESS_DENIED_HRESULT)
    {
        return Err(io::Error::other(
            "LPAC did not deny the shared-package fixture",
        ));
    }
    for (name, protocol) in [("tcp_loopback", "tcp"), ("udp_loopback", "udp")] {
        if checks[name].allowed
            || checks[name].native_error != Some(SOCKET_ACCESS_DENIED)
            || lpac["network_received"][protocol] != false
        {
            return Err(io::Error::other(format!(
                "LPAC loopback denial not established: {protocol}"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "observation_tests.rs"]
mod tests;
