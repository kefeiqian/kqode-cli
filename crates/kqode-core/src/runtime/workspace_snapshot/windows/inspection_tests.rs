use std::{fs, path::Path, sync::Barrier, time::Duration};

use super::{directory, handles, inspection_handles};
use crate::{
    cancellation::CancellationToken,
    runtime::workspace_snapshot::tests::support::{Fixture, limits},
};

#[test]
fn inspection_reopen_has_an_independent_multi_page_directory_cursor() {
    let fixture = Fixture::new();
    for index in 0..256 {
        fs::write(
            fixture.source.join(format!("file-{index:04}-{:0<128}", "")),
            [],
        )
        .unwrap();
    }
    let mut bound = limits();
    bound.max_entries = 256;
    bound.timeout = Duration::from_secs(20);
    let snapshot = fixture.capture(bound).unwrap();
    let original = snapshot.directory.as_ref().unwrap();
    let first = inspection_handles::root(original).unwrap();
    let second = inspection_handles::root(original).unwrap();
    let mut seen = 0;
    directory::visit(&first, |_| {
        if seen == 0 {
            let mut nested = 0;
            directory::visit(&second, |_| {
                nested += 1;
                Ok(())
            })?;
            assert_eq!(nested, 256);
        }
        seen += 1;
        Ok(())
    })
    .unwrap();
    assert_eq!(seen, 256);
    drop((first, second));
    let barrier = Barrier::new(4);
    std::thread::scope(|scope| {
        for _ in 0..4 {
            let snapshot = &snapshot;
            let barrier = &barrier;
            scope.spawn(move || {
                barrier.wait();
                for _ in 0..4 {
                    assert!(
                        snapshot
                            .inspect_changes(bound, &CancellationToken::default())
                            .unwrap()
                            .is_empty()
                    );
                }
            });
        }
    });
    snapshot.close().unwrap();
}

#[test]
fn inspection_pins_prevent_file_writes_and_deletes_until_released() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), b"data").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    let pinned = handles::inspection_child(
        snapshot.directory.as_ref().unwrap(),
        Path::new("file").as_os_str(),
    )
    .unwrap();
    assert!(fs::write(snapshot.root().join("file"), b"bad").is_err());
    assert!(fs::remove_file(snapshot.root().join("file")).is_err());
    drop(pinned);
    fs::write(snapshot.root().join("file"), b"after").unwrap();
    assert_eq!(
        snapshot
            .inspect_changes(limits(), &CancellationToken::default())
            .unwrap()
            .len(),
        1
    );
    snapshot.close().unwrap();
}

#[test]
fn inspection_rejects_a_stale_recorded_location_and_closes_the_owned_object() {
    use crate::runtime::SnapshotError;
    let fixture = Fixture::new();
    let mut snapshot = fixture.capture(limits()).unwrap();
    snapshot.root = fixture.root.join("no-longer-the-owned-copy");
    assert!(matches!(
        snapshot.inspect_changes(limits(), &CancellationToken::default()),
        Err(SnapshotError::SnapshotMoved)
    ));
    snapshot.close().unwrap();
    fixture.assert_clean();
}
