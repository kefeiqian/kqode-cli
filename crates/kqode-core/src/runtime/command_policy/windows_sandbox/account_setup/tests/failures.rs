use super::super::{SandboxAccountRole as Role, SandboxAccountSetupError as Error, model::ROLES};
use super::support::*;

#[test]
fn native_prerequisite_and_lookup_errors_never_reach_the_journal_or_mutation() {
    for step in [
        "elevation",
        "inspect:Group",
        "inspect:Offline",
        "inspect:Online",
    ] {
        let (plan, mut host, mut journal) = fixture();
        host.fail = Some(step.into());
        assert!(matches!(
            run(&plan, &mut host, &mut journal),
            Err(Error::Native { .. })
        ));
        assert!(host.entries.is_empty());
        assert!(journal.records.is_empty());
    }
}

#[test]
fn failed_journal_begin_or_intent_prevents_the_corresponding_mutation() {
    for (step, created_count) in [
        ("journal:begin", 0),
        ("intent:Group", 0),
        ("intent:Offline", 1),
        ("intent:Online", 2),
    ] {
        let (plan, mut host, mut journal) = fixture();
        journal.fail = Some(step.into());
        assert!(matches!(
            run(&plan, &mut host, &mut journal),
            Err(Error::Journal { .. })
        ));
        assert_eq!(host.entries.len(), created_count);
        assert!(host.members.is_empty());
        assert!(!journal.records.contains(&"prepared-disabled".into()));
    }
}

#[test]
fn native_creation_errors_preserve_pending_intent_without_continuing() {
    for (index, role) in ROLES.into_iter().enumerate() {
        let (plan, mut host, mut journal) = fixture();
        host.fail = Some(format!("create:{role:?}"));
        assert!(matches!(
            run(&plan, &mut host, &mut journal),
            Err(Error::Native { .. })
        ));
        assert_eq!(host.entries.len(), index);
        assert_eq!(journal.records.last().unwrap(), &format!("intent:{role:?}"));
        assert!(host.members.is_empty());
    }
}

#[test]
fn failed_sid_receipt_leaves_an_explicit_recovery_intent_and_stops() {
    for (index, role) in ROLES.into_iter().enumerate() {
        let (plan, mut host, mut journal) = fixture();
        journal.fail = Some(format!("created:{role:?}"));
        assert!(matches!(
            run(&plan, &mut host, &mut journal),
            Err(Error::Journal { .. })
        ));
        assert_eq!(host.entries.len(), index + 1);
        assert_eq!(journal.records.last().unwrap(), &format!("intent:{role:?}"));
        assert!(host.members.is_empty());
    }
}

#[test]
fn membership_and_final_checkpoint_failures_do_not_report_preparation_success() {
    for (step, journal_fault) in [
        ("add:Offline", false),
        ("add:Online", false),
        ("member-intent:Offline", true),
        ("member-added:Offline", true),
        ("member-intent:Online", true),
        ("member-added:Online", true),
        ("prepared-disabled", true),
    ] {
        let (plan, mut host, mut journal) = fixture();
        if journal_fault {
            journal.fail = Some(step.into());
        } else {
            host.fail = Some(step.into());
        }
        assert!(run(&plan, &mut host, &mut journal).is_err());
        assert_eq!(host.entries.len(), 3);
        assert!(
            host.entries
                .iter()
                .filter(|entry| entry.identity.role != Role::Group)
                .all(|entry| entry.disabled_normal_user)
        );
        assert!(!journal.records.contains(&"prepared-disabled".into()));
    }
}

#[test]
fn wrong_ownership_and_changed_final_sids_fail_closed() {
    for role in ROLES {
        let (plan, mut host, mut journal) = fixture();
        host.malformed = Some(role);
        assert!(
            matches!(run(&plan, &mut host, &mut journal), Err(Error::OwnershipMismatch(found)) if found == role)
        );
        assert!(!journal.records.contains(&"prepared-disabled".into()));
    }
    let (plan, mut host, mut journal) = fixture();
    host.final_sid_mismatch = true;
    assert!(matches!(
        run(&plan, &mut host, &mut journal),
        Err(Error::OwnershipMismatch(Role::Offline))
    ));
    assert!(!journal.records.contains(&"prepared-disabled".into()));
}
