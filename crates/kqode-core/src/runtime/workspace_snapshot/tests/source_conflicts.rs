use super::super::{SnapshotConflictKind as Kind, SnapshotSourceConflict as Conflict};
use super::support::{Fixture, check_source, junction, limits};
use std::fs::{self, File, FileTimes};

#[test]
fn source_check_ignores_unrelated_edits_and_never_writes_either_tree() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("changed"), b"before").unwrap();
    fs::write(fixture.source.join("deleted"), b"old").unwrap();
    fs::write(fixture.source.join("unrelated"), b"keep").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::write(snapshot.root().join("changed"), b"after").unwrap();
    fs::remove_file(snapshot.root().join("deleted")).unwrap();
    fs::create_dir(snapshot.root().join("added")).unwrap();
    fs::write(snapshot.root().join("added\\new"), b"new").unwrap();
    fs::write(fixture.source.join("unrelated"), b"user edit").unwrap();
    junction(&fixture.source.join("unrelated-link"), &fixture.staging);
    let first = check_source(&snapshot);
    assert_eq!(first.changes.len(), 4);
    assert!(first.conflicts.is_empty());
    assert_eq!(check_source(&snapshot), first);
    assert_eq!(fs::read(fixture.source.join("changed")).unwrap(), b"before");
    assert_eq!(fs::read(fixture.source.join("deleted")).unwrap(), b"old");
    assert_eq!(
        fs::read(fixture.source.join("unrelated")).unwrap(),
        b"user edit"
    );
    assert!(!fixture.source.join("added").exists());
    assert_eq!(fs::read(snapshot.root().join("changed")).unwrap(), b"after");
    fs::remove_dir(fixture.source.join("unrelated-link")).unwrap();
    snapshot.close().unwrap();
}

#[test]
fn source_check_reports_content_missing_existing_and_type_conflicts() {
    let fixture = Fixture::new();
    for name in ["changed", "missing", "type"] {
        fs::write(fixture.source.join(name), b"old").unwrap();
    }
    let snapshot = fixture.capture(limits()).unwrap();
    fs::write(snapshot.root().join("changed"), b"new").unwrap();
    fs::write(snapshot.root().join("added"), b"new").unwrap();
    fs::remove_file(snapshot.root().join("missing")).unwrap();
    fs::write(snapshot.root().join("type"), b"new").unwrap();
    let changed = fixture.source.join("changed");
    let time = fs::metadata(&changed).unwrap().modified().unwrap();
    fs::write(&changed, b"usr").unwrap();
    File::options()
        .write(true)
        .open(&changed)
        .unwrap()
        .set_times(FileTimes::new().set_modified(time))
        .unwrap();
    fs::write(fixture.source.join("added"), b"user").unwrap();
    fs::remove_file(fixture.source.join("missing")).unwrap();
    fs::remove_file(fixture.source.join("type")).unwrap();
    fs::create_dir(fixture.source.join("type")).unwrap();
    assert_eq!(
        check_source(&snapshot).conflicts,
        vec![
            Conflict {
                path: "added".into(),
                kind: Kind::AlreadyExists
            },
            Conflict {
                path: "changed".into(),
                kind: Kind::ContentChanged
            },
            Conflict {
                path: "missing".into(),
                kind: Kind::Missing
            },
            Conflict {
                path: "type".into(),
                kind: Kind::TypeChanged
            },
        ]
    );
    fs::write(&changed, b"old").unwrap();
    assert!(
        !check_source(&snapshot)
            .conflicts
            .iter()
            .any(|item| item.path == std::path::Path::new("changed"))
    );
    snapshot.close().unwrap();
}

#[test]
fn source_check_reports_lost_ancestors_even_for_new_copy_files() {
    for replace_with_file in [false, true] {
        let fixture = Fixture::new();
        fs::create_dir(fixture.source.join("parent")).unwrap();
        let snapshot = fixture.capture(limits()).unwrap();
        fs::write(snapshot.root().join("parent\\new"), []).unwrap();
        fs::remove_dir(fixture.source.join("parent")).unwrap();
        if replace_with_file {
            fs::write(fixture.source.join("parent"), b"user").unwrap();
        }
        assert_eq!(
            check_source(&snapshot).conflicts,
            vec![Conflict {
                path: "parent\\new".into(),
                kind: Kind::AncestorChanged
            },]
        );
        snapshot.close().unwrap();
    }
}

#[test]
fn source_check_does_not_overlook_new_children_of_removed_or_replaced_directories() {
    for replace_with_file in [false, true] {
        let fixture = Fixture::new();
        fs::create_dir_all(fixture.source.join("parent\\nested")).unwrap();
        fs::write(fixture.source.join("parent\\nested\\old"), []).unwrap();
        let snapshot = fixture.capture(limits()).unwrap();
        fs::remove_dir_all(snapshot.root().join("parent")).unwrap();
        if replace_with_file {
            fs::write(snapshot.root().join("parent"), b"replacement").unwrap();
        }
        fs::write(fixture.source.join("parent\\new"), b"user").unwrap();
        fs::create_dir(fixture.source.join("parent\\nested\\newdir")).unwrap();
        assert_eq!(
            check_source(&snapshot).conflicts,
            vec![
                Conflict {
                    path: "parent\\nested\\newdir".into(),
                    kind: Kind::NewDescendant
                },
                Conflict {
                    path: "parent\\new".into(),
                    kind: Kind::NewDescendant
                },
            ]
        );
        assert_eq!(
            fs::read(fixture.source.join("parent\\new")).unwrap(),
            b"user"
        );
        snapshot.close().unwrap();
    }
}

#[test]
fn source_check_detects_case_aliases_and_ancestor_case_renames() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), b"old").unwrap();
    fs::create_dir(fixture.source.join("parent")).unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::rename(snapshot.root().join("file"), snapshot.root().join("FILE")).unwrap();
    fs::write(snapshot.root().join("parent\\new"), []).unwrap();
    fs::rename(fixture.source.join("parent"), fixture.source.join("PARENT")).unwrap();
    assert_eq!(
        check_source(&snapshot).conflicts,
        vec![
            Conflict {
                path: "FILE".into(),
                kind: Kind::PathChanged
            },
            Conflict {
                path: "parent\\new".into(),
                kind: Kind::PathChanged
            },
        ]
    );
    snapshot.close().unwrap();
}
