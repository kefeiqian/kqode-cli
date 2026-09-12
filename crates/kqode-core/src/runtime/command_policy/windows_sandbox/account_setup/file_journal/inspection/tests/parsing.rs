use super::super::{
    SandboxAccountJournalState as State, SandboxAccountPendingMutation as Pending,
    parser::{MAX_JOURNAL_BYTES, MAX_RECORDS, parse},
};
use super::support::*;
use serde_json::json;

#[test]
fn every_valid_prefix_reports_recorded_receipts_and_uncertain_mutations_only() {
    let (plan, bytes) = valid();
    let records = rows(&bytes);
    for count in 1..=records.len() {
        let report = parse(&encode(&records[..count]), &plan).unwrap();
        assert_eq!(report.record_count(), count as u32);
        assert_eq!(report.identities().len(), ((count - 1) / 2).min(3));
        assert_eq!(
            report.state(),
            if count == 12 {
                State::PreparedDisabledRecorded
            } else {
                State::Incomplete
            }
        );
        let pending = match count {
            2 => Some(Pending::Create { role: Role::Group }),
            4 => Some(Pending::Create {
                role: Role::Offline,
            }),
            6 => Some(Pending::Create { role: Role::Online }),
            8 => Some(Pending::AddMember {
                role: Role::Offline,
            }),
            10 => Some(Pending::AddMember { role: Role::Online }),
            _ => None,
        };
        assert_eq!(report.pending_mutation(), pending);
        assert!(!serde_json::to_string(&report).unwrap().contains("password"));
        assert!(!format!("{report:?}").contains("password"));
    }
}

#[test]
fn malformed_unknown_duplicate_or_missing_fields_never_return_a_valid_prefix() {
    let (plan, bytes) = valid();
    for pointer in ["/extra", "/plan/extra", "/passwords/extra"] {
        let mut records = rows(&bytes);
        let segments: Vec<_> = pointer.split('/').filter(|s| !s.is_empty()).collect();
        if segments.len() == 1 {
            records[0][segments[0]] = json!("DO_NOT_ECHO");
        } else {
            records[0][segments[0]][segments[1]] = json!("DO_NOT_ECHO");
        }
        let error = parse(&encode(&records), &plan).unwrap_err();
        assert!(!format!("{error:?}").contains("DO_NOT_ECHO"));
    }
    for (from, to) in [
        ("\"sequence\":0", "\"sequence\":0,\"sequence\":0"),
        (
            "\"kind\":\"begin\"",
            "\"kind\":\"begin\",\"kind\":\"begin\"",
        ),
        (
            "\"stage\":\"created\"",
            "\"stage\":\"created\",\"stage\":\"created\"",
        ),
        ("\"version\":1", "\"version\":1,\"version\":1"),
    ] {
        let text = std::str::from_utf8(&bytes).unwrap();
        let changed = text.replacen(from, to, 1);
        assert_ne!(text, changed);
        assert!(parse(changed.as_bytes(), &plan).is_err());
    }
    let mut records = rows(&bytes);
    records[0].as_object_mut().unwrap().remove("passwords");
    assert!(parse(&encode(&records), &plan).is_err());
    let mut records = rows(&bytes);
    records[2]["checkpoint"]["identity"]["extra"] = json!(true);
    assert!(parse(&encode(&records), &plan).is_err());
}

#[test]
fn wrong_versions_sequences_plans_order_and_sids_are_rejected() {
    let (plan, bytes) = valid();
    for (index, pointer, value) in [
        (0, "/version", json!(2)),
        (0, "/sequence", json!(1)),
        (0, "/passwords/version", json!(2)),
        (0, "/plan/group", json!("different")),
        (2, "/sequence", json!(1)),
        (2, "/checkpoint/identity/name", json!("different")),
        (2, "/checkpoint/identity/sid", json!("S-1-5-18")),
        (2, "/checkpoint/identity/sid", json!("S-1-5-21-01-2-3-1000")),
        (
            2,
            "/checkpoint/identity/sid",
            json!("S-1-5-21-1-2-3-4294967296"),
        ),
        (3, "/checkpoint/role", json!("online")),
    ] {
        let mut records = rows(&bytes);
        *records[index].pointer_mut(pointer).unwrap() = value;
        assert!(parse(&encode(&records), &plan).is_err());
    }
    let other = Plan::new(uuid::Uuid::new_v4()).unwrap();
    assert!(parse(&bytes, &other).is_err());
    let mut records = rows(&bytes);
    records[4]["checkpoint"]["identity"]["sid"] =
        records[2]["checkpoint"]["identity"]["sid"].clone();
    assert!(parse(&encode(&records), &plan).is_err());
    let mut records = rows(&bytes);
    records[11]["checkpoint"]["identities"]
        .as_array_mut()
        .unwrap()
        .reverse();
    assert!(parse(&encode(&records), &plan).is_err());
}

#[test]
fn password_swap_corruption_and_foreign_installation_blobs_fail_verification() {
    let (plan, bytes) = valid();
    for variant in 0..4 {
        let mut records = rows(&bytes);
        let passwords = &mut records[0]["passwords"];
        match variant {
            0 => passwords["offline"] = passwords["online"].clone(),
            1 => passwords["offline"] = json!([]),
            2 => passwords["offline"] = json!([1, 2, 3]),
            _ => {
                let (_, foreign) = valid();
                passwords["offline"] = rows(&foreign)[0]["passwords"]["offline"].clone();
            }
        }
        assert!(parse(&encode(&records), &plan).is_err());
    }
}

#[test]
fn torn_empty_invalid_utf8_and_exact_record_and_total_limits_are_enforced() {
    let (plan, bytes) = valid();
    for bad in [
        Vec::new(),
        vec![b'\n'],
        vec![255, b'\n'],
        bytes[..bytes.len() - 1].to_vec(),
    ] {
        assert!(parse(&bad, &plan).is_err());
    }
    let record_limit = super::super::super::records::MAX_RECORD_BYTES;
    let mut at_limit = Vec::new();
    for line in bytes[..bytes.len() - 1].split(|byte| *byte == b'\n') {
        at_limit.extend_from_slice(line);
        at_limit.resize(at_limit.len() + record_limit - line.len() - 1, b' ');
        at_limit.push(b'\n');
    }
    assert_eq!(at_limit.len(), MAX_JOURNAL_BYTES);
    assert_eq!(
        parse(&at_limit, &plan).unwrap().record_count(),
        MAX_RECORDS as u32
    );
    at_limit.push(b'\n');
    assert!(parse(&at_limit, &plan).is_err());
    let mut header = encode(&rows(&bytes)[..1]);
    header.pop();
    header.resize(record_limit, b' ');
    header.push(b'\n');
    assert!(parse(&header, &plan).is_err());
    let mut extra = bytes.clone();
    extra.extend_from_slice(b"{}\n");
    assert!(parse(&extra, &plan).is_err());
}
