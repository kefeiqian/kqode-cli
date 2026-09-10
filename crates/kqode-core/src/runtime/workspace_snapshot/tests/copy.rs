use super::super::SnapshotError;
use super::support::{Fixture, junction, limits};
use std::{fs, path::PathBuf};

#[test]
fn copies_data_into_independent_files_without_mutating_source_or_outside_aliases() {
    let fixture = Fixture::new();
    fs::write(fixture.root.join("outside.txt"), "original").unwrap();
    fs::hard_link(
        fixture.root.join("outside.txt"),
        fixture.source.join("a.txt"),
    )
    .unwrap();
    fs::hard_link(fixture.source.join("a.txt"), fixture.source.join("b.txt")).unwrap();
    fs::create_dir(fixture.source.join("nested")).unwrap();
    fs::write(fixture.source.join("nested\\unicode.txt"), "你好").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    assert_eq!(snapshot.summary().files, 3);
    assert_eq!(snapshot.summary().directories, 1);
    assert_eq!(snapshot.summary().bytes, 22);
    fs::write(snapshot.root().join("a.txt"), "changed").unwrap();
    for path in [
        fixture.root.join("outside.txt"),
        fixture.source.join("a.txt"),
        fixture.source.join("b.txt"),
        snapshot.root().join("b.txt"),
    ] {
        assert_eq!(fs::read_to_string(path).unwrap(), "original");
    }
    snapshot.close().unwrap();
    fixture.assert_clean();
}

#[test]
fn git_directories_and_worktree_pointer_files_are_explicitly_excluded() {
    for directory in [false, true] {
        let fixture = Fixture::new();
        if directory {
            fs::create_dir(fixture.source.join(".git")).unwrap();
            fs::write(fixture.source.join(".git\\config"), "metadata").unwrap();
        } else {
            fs::write(fixture.source.join(".git"), "gitdir: outside-not-followed").unwrap();
        }
        fs::write(fixture.source.join("keep.txt"), "kept").unwrap();
        let snapshot = fixture.capture(limits()).unwrap();
        assert_eq!(
            snapshot.summary().excluded_git_paths,
            vec![PathBuf::from(".git")]
        );
        assert!(!snapshot.root().join(".git").exists());
        assert!(fixture.source.join(".git").exists());
        snapshot.close().unwrap();
    }
}

#[test]
fn rejects_file_and_directory_named_streams_instead_of_stripping_them() {
    for directory in [false, true] {
        let fixture = Fixture::new();
        if directory {
            fs::create_dir(fixture.source.join("item")).unwrap();
        } else {
            fs::write(fixture.source.join("item"), "data").unwrap();
        }
        fs::write(fixture.source.join("item:Zone.Identifier"), "fixture").unwrap();
        assert!(matches!(
            fixture.capture(limits()),
            Err(SnapshotError::UnsupportedEntry {
                reason: "named data streams are not supported",
                ..
            })
        ));
        fixture.assert_clean();
    }
}

#[test]
fn junctions_are_rejected_without_reading_or_changing_the_target() {
    let fixture = Fixture::new();
    let outside = fixture.root.join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("marker.txt"), "original").unwrap();
    junction(&fixture.source.join("escape"), &outside);
    assert!(matches!(
        fixture.capture(limits()),
        Err(SnapshotError::UnsupportedEntry {
            reason: "reparse points are not followed",
            ..
        })
    ));
    fixture.assert_clean();
    assert_eq!(
        fs::read_to_string(outside.join("marker.txt")).unwrap(),
        "original"
    );
}
