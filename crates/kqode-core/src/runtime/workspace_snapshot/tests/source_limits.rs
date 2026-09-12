use super::super::SnapshotError;
use super::support::{Fixture, limits};
use crate::cancellation::CancellationToken;
use std::{fs, time::Duration};

#[test]
fn source_check_shares_byte_and_entry_budgets_across_copy_and_source() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), b"1234").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::write(snapshot.root().join("file"), b"5678").unwrap();
    let cancel = CancellationToken::default();
    let mut bound = limits();
    bound.max_bytes = 7;
    assert!(matches!(
        snapshot.check_source_conflicts(bound, &cancel),
        Err(SnapshotError::LimitExceeded("max_bytes"))
    ));
    bound.max_bytes = 8;
    bound.max_entries = 1;
    assert!(matches!(
        snapshot.check_source_conflicts(bound, &cancel),
        Err(SnapshotError::LimitExceeded("max_entries"))
    ));
    bound.max_entries = 2;
    assert!(
        snapshot
            .check_source_conflicts(bound, &cancel)
            .unwrap()
            .conflicts
            .is_empty()
    );
    snapshot.close().unwrap();
}

#[test]
fn source_check_counts_new_source_directory_children_in_its_entry_budget() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.source.join("dir")).unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::remove_dir(snapshot.root().join("dir")).unwrap();
    for name in ["a", "b"] {
        fs::write(fixture.source.join("dir").join(name), []).unwrap();
    }
    let mut bound = limits();
    bound.max_entries = 2;
    assert!(matches!(
        snapshot.check_source_conflicts(bound, &CancellationToken::default()),
        Err(SnapshotError::LimitExceeded("max_entries"))
    ));
    bound.max_entries = 3;
    assert_eq!(
        snapshot
            .check_source_conflicts(bound, &CancellationToken::default())
            .unwrap()
            .conflicts
            .len(),
        2
    );
    snapshot.close().unwrap();
}

#[test]
fn source_check_bounds_deleted_source_ancestry_and_refuses_cancelled_work() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.source.join("a\\b")).unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::remove_dir_all(snapshot.root().join("a")).unwrap();
    let mut bound = limits();
    bound.max_depth = 1;
    assert!(matches!(
        snapshot.check_source_conflicts(bound, &CancellationToken::default()),
        Err(SnapshotError::LimitExceeded("max_depth"))
    ));
    let cancel = CancellationToken::default();
    cancel.cancel();
    assert!(matches!(
        snapshot.check_source_conflicts(limits(), &cancel),
        Err(SnapshotError::Cancelled)
    ));
    bound = limits();
    bound.timeout = Duration::ZERO;
    assert!(matches!(
        snapshot.check_source_conflicts(bound, &CancellationToken::default()),
        Err(SnapshotError::InvalidLimit("timeout"))
    ));
    assert!(snapshot.root().exists());
    snapshot.close().unwrap();
    fixture.assert_clean();
}
