use super::support::*;
use crate::cancellation::CancellationToken;
use std::{fs, time::Duration};

#[test]
fn public_reconciliation_checks_guard_and_journal_before_any_sam_observation() {
    let (fixture, plan, _, _) = fixture(12);
    let bytes = fs::read(fixture.journal(&plan)).unwrap();
    let cancellation = CancellationToken::default();
    cancellation.cancel();
    assert!(matches!(
        plan.reconcile_disabled_accounts(&fixture.parent(), Duration::from_secs(15), &cancellation),
        Err(Error::Cancelled)
    ));
    fs::write(fixture.journal(&plan), b"torn journal").unwrap();
    assert!(matches!(
        plan.reconcile_disabled_accounts(
            &fixture.parent(),
            Duration::from_secs(15),
            &CancellationToken::default()
        ),
        Err(Error::Journal { .. })
    ));
    assert_eq!(fs::read(fixture.journal(&plan)).unwrap(), b"torn journal");
    assert!(!bytes.is_empty());
}

#[test]
#[ignore = "read-only local SAM probe; queries only fresh generated account names"]
fn native_account_reconciliation_observes_missing_synthetic_accounts() {
    let (fixture, plan, _, _) = fixture(12);
    let before = fs::read(fixture.journal(&plan)).unwrap();
    let report = plan
        .reconcile_disabled_accounts(
            &fixture.parent(),
            Duration::from_secs(30),
            &CancellationToken::default(),
        )
        .unwrap();
    assert_eq!(
        report.discrepancies(),
        &[
            Issue::MissingRecordedPrincipal { role: Role::Group },
            Issue::MissingRecordedPrincipal {
                role: Role::Offline
            },
            Issue::MissingRecordedPrincipal { role: Role::Online },
        ]
    );
    assert!(report.observed_identities().is_empty());
    assert!(report.group_members().is_none());
    assert_eq!(fs::read(fixture.journal(&plan)).unwrap(), before);
}
