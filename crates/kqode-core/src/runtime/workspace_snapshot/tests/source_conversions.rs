use super::super::{SnapshotConflictKind as Kind, SnapshotSourceConflict as Conflict};
use super::support::{Fixture, check_source, limits};
use std::fs;

#[test]
fn source_check_accepts_planned_file_directory_conversions_and_checks_the_parent() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file-to-dir"), b"before").unwrap();
    fs::create_dir(fixture.source.join("dir-to-file")).unwrap();
    fs::write(fixture.source.join("dir-to-file\\old"), b"old").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::remove_file(snapshot.root().join("file-to-dir")).unwrap();
    fs::create_dir_all(snapshot.root().join("file-to-dir\\nested")).unwrap();
    fs::write(snapshot.root().join("file-to-dir\\nested\\new"), b"new").unwrap();
    fs::remove_dir_all(snapshot.root().join("dir-to-file")).unwrap();
    fs::write(snapshot.root().join("dir-to-file"), b"replacement").unwrap();
    let result = check_source(&snapshot);
    assert_eq!(result.changes.len(), 5);
    assert!(result.conflicts.is_empty());
    fs::write(fixture.source.join("file-to-dir"), b"user edit").unwrap();
    assert_eq!(
        check_source(&snapshot).conflicts,
        vec![Conflict {
            path: "file-to-dir".into(),
            kind: Kind::ContentChanged
        },]
    );
    snapshot.close().unwrap();
}

#[test]
fn source_check_checks_new_parent_collisions_before_ignoring_their_descendants() {
    let fixture = Fixture::new();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::create_dir(snapshot.root().join("newdir")).unwrap();
    fs::write(snapshot.root().join("newdir\\file"), b"copy").unwrap();
    fs::create_dir(fixture.source.join("newdir")).unwrap();
    fs::write(fixture.source.join("newdir\\file"), b"user").unwrap();
    assert_eq!(
        check_source(&snapshot).conflicts,
        vec![Conflict {
            path: "newdir".into(),
            kind: Kind::AlreadyExists
        },]
    );
    assert_eq!(
        fs::read(fixture.source.join("newdir\\file")).unwrap(),
        b"user"
    );
    snapshot.close().unwrap();
}
