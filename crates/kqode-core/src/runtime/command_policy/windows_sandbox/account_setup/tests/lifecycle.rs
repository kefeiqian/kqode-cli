use super::super::{
    SandboxAccountRole as Role, SandboxAccountSetupError as Error,
    WindowsSandboxAccountPlan as Plan, model::ROLES, workflow,
};
use super::support::*;
use crate::cancellation::CancellationToken;
use std::time::Duration;

#[test]
fn generated_names_are_stable_local_ascii_and_do_not_accept_nil_installations() {
    let id = uuid::Uuid::new_v4();
    let first = Plan::new(id).unwrap();
    let second = Plan::new(id).unwrap();
    let other = Plan::new(uuid::Uuid::new_v4()).unwrap();
    for role in ROLES {
        let name = first.name(role);
        assert_eq!(name, second.name(role));
        assert_ne!(name, other.name(role));
        assert!(
            name.bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        );
        assert!(name.len() <= if role == Role::Group { 256 } else { 20 });
    }
    assert_ne!(first.name(Role::Offline), first.name(Role::Online));
    assert!(matches!(
        Plan::new(uuid::Uuid::nil()),
        Err(Error::InvalidPlan)
    ));
}

#[test]
fn setup_journals_secrets_and_intents_before_mutation_and_returns_only_disabled_identities() {
    let (plan, mut host, mut journal) = fixture();
    let result = run(&plan, &mut host, &mut journal).unwrap();
    assert_eq!(result.identities().len(), 3);
    assert_eq!(host.members, [Role::Offline, Role::Online]);
    assert!(
        host.entries
            .iter()
            .filter(|entry| entry.identity.role != Role::Group)
            .all(|entry| entry.disabled_normal_user)
    );
    assert_eq!(
        &*host.events.borrow(),
        &[
            "elevation",
            "inspect:Group",
            "inspect:Offline",
            "inspect:Online",
            "journal:begin",
            "intent:Group",
            "create:Group",
            "inspect:Group",
            "created:Group",
            "intent:Offline",
            "create:Offline",
            "inspect:Offline",
            "created:Offline",
            "intent:Online",
            "create:Online",
            "inspect:Online",
            "created:Online",
            "member-intent:Offline",
            "add:Offline",
            "member-added:Offline",
            "member-intent:Online",
            "add:Online",
            "member-added:Online",
            "inspect:Group",
            "inspect:Offline",
            "inspect:Online",
            "prepared-disabled",
        ]
    );
}

#[test]
fn preexisting_names_are_never_adopted_or_reset_even_with_matching_markers() {
    for role in ROLES {
        let (plan, mut host, mut journal) = fixture();
        host.entries.push(FakeHost::facts(&plan, role));
        assert!(
            matches!(run(&plan, &mut host, &mut journal), Err(Error::NameAlreadyExists(found)) if found == role)
        );
        assert!(journal.records.is_empty());
        assert_eq!(host.entries.len(), 1);
        assert!(host.members.is_empty());
    }
}

#[test]
fn cancellation_during_creation_still_records_ownership_then_stops() {
    let (plan, mut host, mut journal) = fixture();
    let cancellation = CancellationToken::default();
    host.cancel_after_create = Some((Role::Offline, cancellation.clone()));
    assert!(matches!(
        workflow::run(
            &plan,
            &mut host,
            &mut journal,
            Duration::from_secs(15),
            &cancellation
        ),
        Err(Error::Cancelled)
    ));
    assert_eq!(journal.records.last().unwrap(), "created:Offline");
    assert_eq!(host.entries.len(), 2);
    assert!(host.members.is_empty());
}

#[test]
fn cancellation_and_timeout_prevent_new_account_mutations() {
    let (plan, mut host, mut journal) = fixture();
    let cancellation = CancellationToken::default();
    cancellation.cancel();
    assert!(matches!(
        workflow::run(
            &plan,
            &mut host,
            &mut journal,
            Duration::from_secs(1),
            &cancellation
        ),
        Err(Error::Cancelled)
    ));
    assert!(host.events.borrow().is_empty());
    assert!(matches!(
        workflow::run(
            &plan,
            &mut host,
            &mut journal,
            Duration::ZERO,
            &CancellationToken::default()
        ),
        Err(Error::InvalidTimeout)
    ));
    host.delay = Duration::from_millis(20);
    assert!(matches!(
        workflow::run(
            &plan,
            &mut host,
            &mut journal,
            Duration::from_millis(1),
            &CancellationToken::default()
        ),
        Err(Error::TimedOut)
    ));
    assert!(host.entries.is_empty());
    assert!(journal.records.is_empty());
}
