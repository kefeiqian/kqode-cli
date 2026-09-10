use crate::runtime::workspace_snapshot::tests::support::{Fixture, junction, limits};
use crate::{cancellation::CancellationToken, runtime::SnapshotError};
use std::fs;

#[test]
fn dirty_hardlink_copy_is_rejected_before_any_access_grant() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("original.txt"), "original").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::hard_link(
        fixture.source.join("original.txt"),
        snapshot.root().join("injected.txt"),
    )
    .unwrap();
    assert!(matches!(
        snapshot.execution_files(100, &CancellationToken::default()),
        Err(SnapshotError::Io {
            operation: "validate native ACL target",
            ..
        })
    ));
    snapshot.close().unwrap();
    assert_eq!(
        fs::read_to_string(fixture.source.join("original.txt")).unwrap(),
        "original"
    );
}

#[test]
fn dirty_junction_copy_is_rejected_without_touching_target() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("original.txt"), "original").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    junction(&snapshot.root().join("escape"), &fixture.source);
    assert!(matches!(
        snapshot.execution_files(100, &CancellationToken::default()),
        Err(SnapshotError::Io {
            operation: "validate native ACL target",
            ..
        })
    ));
    snapshot.close().unwrap();
    assert_eq!(
        fs::read_to_string(fixture.source.join("original.txt")).unwrap(),
        "original"
    );
}

#[test]
fn native_access_preflight_is_bounded_and_cancellable() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file.txt"), "data").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    assert!(matches!(
        snapshot.execution_files(1, &CancellationToken::default()),
        Err(SnapshotError::LimitExceeded(_))
    ));
    let cancellation = CancellationToken::default();
    cancellation.cancel();
    assert!(matches!(
        snapshot.execution_files(100, &cancellation),
        Err(SnapshotError::Cancelled)
    ));
    snapshot.close().unwrap();
}
