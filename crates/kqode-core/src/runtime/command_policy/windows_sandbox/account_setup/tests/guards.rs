use super::super::{SandboxAccountRole as Role, SandboxAccountSetupError as Error};
use super::support::*;

#[test]
fn missing_elevation_or_domain_controller_host_stops_before_inspection() {
    for error in [Error::ElevationRequired, Error::DomainControllerUnsupported] {
        let (plan, mut host, mut journal) = fixture();
        host.prerequisite_error = Some(error);
        assert!(run(&plan, &mut host, &mut journal).is_err());
        assert_eq!(&*host.events.borrow(), &["elevation"]);
        assert!(journal.records.is_empty());
        assert!(host.entries.is_empty());
    }
}

#[test]
fn enabled_or_nonordinary_users_are_not_accepted_as_prepared() {
    let (plan, mut host, mut journal) = fixture();
    host.invalid_user_state = true;
    assert!(matches!(
        run(&plan, &mut host, &mut journal),
        Err(Error::OwnershipMismatch(Role::Offline))
    ));
    assert_eq!(journal.records.last().unwrap(), "intent:Offline");
    assert!(host.members.is_empty());
}

#[test]
fn distinct_roles_cannot_be_registered_with_the_same_sid() {
    let (plan, mut host, mut journal) = fixture();
    host.duplicate_sid = true;
    assert!(matches!(
        run(&plan, &mut host, &mut journal),
        Err(Error::OwnershipMismatch(Role::Offline))
    ));
    assert_eq!(journal.records.last().unwrap(), "intent:Offline");
    assert!(host.members.is_empty());
}
