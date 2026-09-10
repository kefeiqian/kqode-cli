use super::*;

fn checks(allowed: bool) -> Value {
    Value::Object(
        CHECK_NAMES
            .iter()
            .map(|name| (name.to_string(), json!({"allowed": allowed})))
            .collect(),
    )
}

fn complete_report() -> Value {
    json!({
        "observations": { "status": "complete", "checks": checks(true) },
        "outside_hardlink_changed": true,
        "network_received": { "tcp": true, "udp": true },
    })
}

fn valid_reports() -> Vec<Value> {
    let control = complete_report();
    let mut app = complete_report();
    for name in ["write_readonly", "write_outside"] {
        app["observations"]["checks"][name] =
            json!({"allowed": false, "code": ACCESS_DENIED_HRESULT});
    }
    let mut lpac = app.clone();
    lpac["observations"]["checks"]["write_all_packages"] =
        json!({"allowed": false, "code": ACCESS_DENIED_HRESULT});
    for name in ["tcp_loopback", "udp_loopback"] {
        lpac["observations"]["checks"][name] =
            json!({"allowed": false, "native_error": SOCKET_ACCESS_DENIED});
    }
    lpac["network_received"] = json!({"tcp": false, "udp": false});
    vec![control, app, Value::Null, lpac]
}

#[test]
fn malformed_or_incomplete_shapes_are_not_observations() {
    for value in [
        "{}",
        "[]",
        "not JSON",
        r#"{"read_granted":{"allowed":true}}"#,
    ] {
        assert!(decode(value).is_err());
    }
    assert_eq!(
        decode(&checks(true).to_string()).unwrap().len(),
        CHECK_NAMES.len()
    );
}

#[test]
fn startup_failure_and_timeouts_cannot_prove_denial() {
    for (exit_code, timed_out) in [(1, false), (0, true)] {
        let output = LaunchOutput {
            token: Default::default(),
            exit_code,
            timed_out,
            stdout: checks(false).to_string(),
            stderr: String::new(),
        };
        assert_eq!(parse(&output)["status"], "inconclusive");
    }
}

#[test]
fn expected_counterexamples_are_complete_evidence_not_full_enforcement() {
    assert!(verify_preferred(&valid_reports()).is_ok());
    assert!(verify_preferred(&[]).is_err());
}

#[test]
fn wrong_denial_reasons_and_failed_controls_are_rejected() {
    for variant in 0..6 {
        let mut reports = valid_reports();
        match variant {
            0 => reports[0]["network_received"]["udp"] = json!(false),
            1 => reports[3]["network_received"]["udp"] = json!(true),
            2 => {
                reports[3]["observations"]["checks"]["tcp_loopback"]["native_error"] = json!(10060)
            }
            3 => reports[3]["observations"]["checks"]["write_outside"]["code"] = json!(0),
            4 => reports[3]["outside_hardlink_changed"] = json!(false),
            5 => reports[3]["observations"]["status"] = json!("inconclusive"),
            _ => unreachable!(),
        }
        assert!(verify_preferred(&reports).is_err(), "variant {variant}");
    }
}
