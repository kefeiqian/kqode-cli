use super::{
    super::{SnapshotError, SnapshotLimits, WorkspaceSnapshot},
    support::{Fixture, limits},
};
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};
use std::fs;

#[test]
fn exact_byte_and_entry_thresholds_are_enforced_with_partial_copy_cleanup() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("a"), "1234").unwrap();
    fs::write(fixture.source.join("b"), "5678").unwrap();
    let exact = SnapshotLimits {
        max_entries: 2,
        max_bytes: 8,
        ..limits()
    };
    fixture.capture(exact).unwrap().close().unwrap();
    for limited in [
        SnapshotLimits {
            max_entries: 1,
            ..exact
        },
        SnapshotLimits {
            max_bytes: 7,
            ..exact
        },
    ] {
        assert!(matches!(
            fixture.capture(limited),
            Err(SnapshotError::LimitExceeded(_))
        ));
        fixture.assert_clean();
    }
}

#[test]
fn depth_cancellation_and_invalid_destination_fail_closed() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.source.join("one\\two")).unwrap();
    assert!(matches!(
        fixture.capture(SnapshotLimits {
            max_depth: 1,
            ..limits()
        }),
        Err(SnapshotError::LimitExceeded("max_depth"))
    ));
    fixture.assert_clean();
    let cancellation = CancellationToken::default();
    cancellation.cancel();
    let source = WorkspacePolicy::new(&fixture.source).unwrap();
    assert!(matches!(
        WorkspaceSnapshot::capture(&source, &fixture.staging, limits(), &cancellation),
        Err(SnapshotError::Cancelled)
    ));
    assert!(matches!(
        WorkspaceSnapshot::capture(
            &source,
            &fixture.source,
            limits(),
            &CancellationToken::default()
        ),
        Err(SnapshotError::DestinationInsideSource)
    ));
    fixture.assert_clean();
}

#[test]
fn invalid_limits_and_expired_preparation_never_leave_a_copy() {
    let fixture = Fixture::new();
    for invalid in [
        SnapshotLimits {
            max_bytes: 0,
            ..limits()
        },
        SnapshotLimits {
            max_entries: 0,
            ..limits()
        },
        SnapshotLimits {
            max_depth: 65,
            ..limits()
        },
        SnapshotLimits {
            timeout: std::time::Duration::MAX,
            ..limits()
        },
        SnapshotLimits {
            timeout: std::time::Duration::ZERO,
            ..limits()
        },
    ] {
        assert!(matches!(
            fixture.capture(invalid),
            Err(SnapshotError::InvalidLimit(_))
        ));
        fixture.assert_clean();
    }
    assert!(matches!(
        fixture.capture(SnapshotLimits {
            timeout: std::time::Duration::from_nanos(1),
            ..limits()
        }),
        Err(SnapshotError::LimitExceeded("timeout"))
    ));
    fixture.assert_clean();
}
