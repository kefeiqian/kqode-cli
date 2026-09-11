use std::{fs, time::Duration};

use super::super::SnapshotError;
use super::support::{Fixture, limits};
use crate::cancellation::CancellationToken;

#[test]
fn inspection_bounds_bytes_depth_and_the_union_including_deleted_paths() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("old"), b"1234").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    let cancel = CancellationToken::default();
    let mut bound = limits();
    bound.max_bytes = 3;
    assert!(matches!(
        snapshot.inspect_changes(bound, &cancel),
        Err(SnapshotError::LimitExceeded("max_bytes"))
    ));
    bound.max_bytes = 4;
    assert!(snapshot.inspect_changes(bound, &cancel).unwrap().is_empty());

    fs::remove_file(snapshot.root().join("old")).unwrap();
    fs::write(snapshot.root().join("new"), b"").unwrap();
    bound.max_entries = 1;
    assert!(matches!(
        snapshot.inspect_changes(bound, &cancel),
        Err(SnapshotError::LimitExceeded("max_entries"))
    ));
    bound.max_entries = 2;
    bound.max_bytes = 1;
    assert_eq!(snapshot.inspect_changes(bound, &cancel).unwrap().len(), 2);

    fs::create_dir_all(snapshot.root().join("a\\b")).unwrap();
    bound = limits();
    bound.max_depth = 1;
    assert!(matches!(
        snapshot.inspect_changes(bound, &cancel),
        Err(SnapshotError::LimitExceeded("max_depth"))
    ));
    bound.max_depth = 2;
    assert_eq!(snapshot.inspect_changes(bound, &cancel).unwrap().len(), 4);
    snapshot.close().unwrap();
    fixture.assert_clean();
}

#[test]
fn inspection_errors_preserve_ownership_and_reject_invalid_limits_and_cancellation() {
    let fixture = Fixture::new();
    let snapshot = fixture.capture(limits()).unwrap();
    for field in ["max_entries", "max_bytes", "max_depth", "timeout"] {
        let mut bound = limits();
        match field {
            "max_entries" => bound.max_entries = 0,
            "max_bytes" => bound.max_bytes = 0,
            "max_depth" => bound.max_depth = 65,
            "timeout" => bound.timeout = Duration::ZERO,
            _ => unreachable!(),
        }
        assert!(matches!(
            snapshot.inspect_changes(bound, &CancellationToken::default()),
            Err(SnapshotError::InvalidLimit(_))
        ));
    }
    let cancel = CancellationToken::default();
    cancel.cancel();
    assert!(matches!(
        snapshot.inspect_changes(limits(), &cancel),
        Err(SnapshotError::Cancelled)
    ));
    assert!(snapshot.root().exists());
    assert!(
        snapshot
            .inspect_changes(limits(), &CancellationToken::default())
            .unwrap()
            .is_empty()
    );
    snapshot.close().unwrap();
    fixture.assert_clean();
}

#[test]
fn inspection_counts_deleted_baseline_entries_even_when_the_copy_is_empty() {
    let fixture = Fixture::new();
    for name in ["a", "b"] {
        fs::write(fixture.source.join(name), []).unwrap();
    }
    let snapshot = fixture.capture(limits()).unwrap();
    for name in ["a", "b"] {
        fs::remove_file(snapshot.root().join(name)).unwrap();
    }
    let mut bound = limits();
    bound.max_entries = 1;
    assert!(matches!(
        snapshot.inspect_changes(bound, &CancellationToken::default()),
        Err(SnapshotError::LimitExceeded("max_entries"))
    ));
    bound.max_entries = 2;
    assert_eq!(
        snapshot
            .inspect_changes(bound, &CancellationToken::default())
            .unwrap()
            .len(),
        2
    );
    snapshot.close().unwrap();
}
