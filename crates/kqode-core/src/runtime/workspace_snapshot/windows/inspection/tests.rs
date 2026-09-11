use super::*;
use crate::runtime::workspace_snapshot::tests::support::{Fixture, limits};
use std::{fs::FileTimes, time::Duration};

#[test]
fn inspection_rechecks_pinned_directory_metadata_before_accepting_a_report() {
    let fixture = Fixture::new();
    let snapshot = fixture.capture(limits()).unwrap();
    let cancellation = CancellationToken::default();
    let original = snapshot.directory.as_ref().unwrap();
    let mut scan = Scan {
        budget: Budget::new(limits(), &cancellation).unwrap(),
        current: Inventory::new(),
        pinned: Vec::new(),
    };
    scan.walk(
        inspection_handles::root(original).unwrap(),
        Path::new(""),
        0,
    )
    .unwrap();
    let before = original.metadata().unwrap().modified().unwrap();
    original
        .set_times(FileTimes::new().set_modified(before + Duration::from_secs(1)))
        .unwrap();
    assert!(
        matches!(scan.validate(), Err(SnapshotError::SnapshotChanged(path))
        if path.as_os_str().is_empty())
    );
    drop(scan);
    snapshot.close().unwrap();
}
