use super::super::super::guard::Guard;
use super::super::{MAX_MEMBERS, engine};
use super::support::*;
use crate::cancellation::CancellationToken;
use std::time::Duration;

#[test]
fn query_failures_at_every_phase_return_errors_not_partial_reports() {
    for call in [
        "local",
        "read:1",
        "read:2",
        "read:3",
        "members:1",
        "read:4",
        "read:5",
        "read:6",
        "members:2",
        "read:7",
        "read:8",
        "read:9",
    ] {
        let (_fixture, plan, journal, mut reader) = fixture(12);
        reader.fail = Some(call.into());
        assert!(matches!(
            run(&plan, journal, &mut reader),
            Err(Error::Native { .. })
        ));
        assert_eq!(reader.calls.last().unwrap(), call);
    }
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.local_error = true;
    assert!(matches!(
        run(&plan, journal, &mut reader),
        Err(Error::DomainControllerUnsupported)
    ));
    assert_eq!(reader.calls, ["local"]);
}

#[test]
fn identity_or_membership_drift_in_either_recheck_is_rejected() {
    for read in 4..=9 {
        let (_fixture, plan, journal, mut reader) = fixture(12);
        reader.drift_at = Some(read);
        assert!(matches!(
            run(&plan, journal, &mut reader),
            Err(Error::ObservationChanged)
        ));
    }
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.second_members = Some(Vec::new());
    assert!(matches!(
        run(&plan, journal, &mut reader),
        Err(Error::ObservationChanged)
    ));
}

#[test]
fn cancellation_and_timeout_stop_following_queries() {
    let (_fixture, plan, journal, mut reader) = fixture(12);
    let cancellation = CancellationToken::default();
    cancellation.cancel();
    let guard = Guard::new(Duration::from_secs(15), &cancellation).unwrap();
    assert!(matches!(
        engine::run(&plan, journal, &mut reader, &guard),
        Err(Error::Cancelled)
    ));
    assert!(reader.calls.is_empty());
    assert!(matches!(
        Guard::new(Duration::ZERO, &cancellation),
        Err(Error::InvalidTimeout)
    ));
    for read in 1..=9 {
        let (_fixture, plan, journal, mut reader) = fixture(12);
        let cancellation = CancellationToken::default();
        reader.cancel_at = Some((read, cancellation.clone()));
        let guard = Guard::new(Duration::from_secs(15), &cancellation).unwrap();
        assert!(matches!(
            engine::run(&plan, journal, &mut reader, &guard),
            Err(Error::Cancelled)
        ));
        assert_eq!(reader.read_count, read);
    }
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.delay = Duration::from_millis(20);
    let cancellation = CancellationToken::default();
    let guard = Guard::new(Duration::from_millis(5), &cancellation).unwrap();
    assert!(matches!(
        engine::run(&plan, journal, &mut reader, &guard),
        Err(Error::TimedOut)
    ));
    assert!(reader.read_count == 0);
}

#[test]
fn member_count_boundary_and_invalid_sid_sets_fail_closed() {
    let (_fixture, plan, journal, mut reader) = fixture(12);
    reader.members = (0..MAX_MEMBERS)
        .map(|index| format!("S-1-5-21-1-2-3-{}", index + 10000))
        .collect();
    assert_eq!(
        run(&plan, journal.clone(), &mut reader)
            .unwrap()
            .group_members()
            .unwrap()
            .len(),
        MAX_MEMBERS
    );
    reader.members.push("S-1-5-21-1-2-3-99999".into());
    assert!(matches!(
        run(&plan, journal, &mut reader),
        Err(Error::ObservationLimit)
    ));
    for members in [
        vec![String::new()],
        vec!["duplicate".into(), "duplicate".into()],
    ] {
        let (_fixture, plan, journal, mut reader) = fixture(12);
        reader.members = members;
        assert!(matches!(
            run(&plan, journal, &mut reader),
            Err(Error::InvalidNativeData(_))
        ));
    }
}
