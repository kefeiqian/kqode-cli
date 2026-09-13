use super::support::*;

#[test]
fn matching_disabled_accounts_and_membership_are_observations_not_a_readiness_token() {
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.second_members = Some(reader.members.iter().rev().cloned().collect());
    let report = run(&plan, journal, &mut reader).unwrap();
    assert!(report.discrepancies().is_empty());
    assert_eq!(report.observed_identities().len(), 3);
    assert_eq!(report.group_members().unwrap().len(), 2);
    assert_eq!(reader.read_count, 9);
    assert_eq!(
        reader
            .calls
            .iter()
            .filter(|call| call.starts_with("members:"))
            .count(),
        2
    );
    let encoded = serde_json::to_string(&report).unwrap();
    assert!(!encoded.contains("password"));
}

#[test]
fn missing_changed_or_unsafe_recorded_accounts_are_never_treated_as_matching() {
    for role in [Role::Group, Role::Offline, Role::Online] {
        for variant in 0..3 {
            let (_fixture, plan, journal, mut reader) = fixture(12);
            match variant {
                0 => reader.facts[role as usize] = None,
                1 => reader.facts[role as usize]
                    .as_mut()
                    .unwrap()
                    .identity
                    .sid
                    .push('9'),
                _ => {
                    reader.facts[role as usize].as_mut().unwrap().marker =
                        "not our installation".into()
                }
            }
            let report = run(&plan, journal, &mut reader).unwrap();
            let expected = if variant == 0 {
                Issue::MissingRecordedPrincipal { role }
            } else {
                Issue::IdentityMismatch { role }
            };
            assert!(report.discrepancies().contains(&expected));
            if role == Role::Group {
                assert!(report.group_members().is_none());
            }
            assert!(
                !serde_json::to_string(&report)
                    .unwrap()
                    .contains("not our installation")
            );
        }
    }
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.facts[1].as_mut().unwrap().disabled_normal_user = false;
    let report = run(&plan, journal, &mut reader).unwrap();
    assert!(report.discrepancies().contains(&Issue::UnsafeUserState {
        role: Role::Offline
    }));
}

#[test]
fn missing_receipts_never_adopt_matching_names_or_complete_pending_intents() {
    for prefix in 1..12 {
        let (_fixture, plan, journal, mut reader) = fixture(prefix);
        let pending = journal.pending_mutation();
        let received: Vec<_> = journal
            .identities()
            .iter()
            .map(|identity| identity.role())
            .collect();
        let report = run(&plan, journal, &mut reader).unwrap();
        assert!(report.discrepancies().contains(&Issue::JournalIncomplete));
        assert_eq!(report.journal().pending_mutation(), pending);
        for role in [Role::Group, Role::Offline, Role::Online] {
            if !received.contains(&role) {
                assert!(
                    report
                        .discrepancies()
                        .contains(&Issue::UnrecordedPrincipal { role })
                );
            }
        }
        if prefix < 3 {
            assert!(report.group_members().is_none());
            assert!(!reader.calls.iter().any(|call| call.starts_with("members:")));
        }
    }
}

#[test]
fn recorded_and_unrecorded_memberships_remain_distinct() {
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.members.remove(0);
    let extra = "S-1-5-21-1-2-3-9999".to_owned();
    reader.members.push(extra.clone());
    let report = run(&plan, journal, &mut reader).unwrap();
    assert!(
        report
            .discrepancies()
            .contains(&Issue::MissingRecordedMembership {
                role: Role::Offline
            })
    );
    assert!(
        report
            .discrepancies()
            .contains(&Issue::UnrecordedMembership { sid: extra })
    );
    let (_fixture, plan, journal, mut reader) = fixture(10);
    let online = reader.members[1].clone();
    let report = run(&plan, journal, &mut reader).unwrap();
    assert!(
        report
            .discrepancies()
            .contains(&Issue::UnrecordedMembership { sid: online })
    );
    assert_eq!(report.journal().membership_receipts(), &[Role::Offline]);
}

#[test]
fn absent_unrecorded_accounts_do_not_become_owned_or_allow_membership_reads() {
    let (_fixture, plan, journal, mut reader) = fixture(1);
    reader.facts.fill(None);
    let report = run(&plan, journal, &mut reader).unwrap();
    assert_eq!(report.discrepancies(), &[Issue::JournalIncomplete]);
    assert!(report.observed_identities().is_empty());
    assert!(report.group_members().is_none());
}
