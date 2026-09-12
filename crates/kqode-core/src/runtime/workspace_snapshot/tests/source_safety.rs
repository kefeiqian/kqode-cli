use super::super::SnapshotError;
use super::support::{Fixture, check_source, junction, limits};
use crate::cancellation::CancellationToken;
use std::{
    fs::{self, OpenOptions},
    os::windows::fs::OpenOptionsExt,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

#[test]
fn source_check_rejects_a_replaced_root_even_with_identical_file_contents() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), b"before").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::write(snapshot.root().join("file"), b"after").unwrap();
    fs::rename(&fixture.source, fixture.root.join("old-source")).unwrap();
    fs::create_dir(&fixture.source).unwrap();
    fs::write(fixture.source.join("file"), b"before").unwrap();
    assert!(matches!(
        snapshot.check_source_conflicts(limits(), &CancellationToken::default()),
        Err(SnapshotError::SourceRootChanged)
    ));
    assert_eq!(fs::read(fixture.source.join("file")).unwrap(), b"before");
    snapshot.close().unwrap();
}

#[test]
fn source_check_without_copy_changes_does_not_open_a_missing_source() {
    let fixture = Fixture::new();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::remove_dir(&fixture.source).unwrap();
    let result = check_source(&snapshot);
    assert!(result.changes.is_empty());
    assert!(result.conflicts.is_empty());
    snapshot.close().unwrap();
}

#[test]
fn source_check_rejects_changed_target_streams_and_hardlinks() {
    for stream in [false, true] {
        let fixture = Fixture::new();
        fs::write(fixture.source.join("file"), b"before").unwrap();
        let snapshot = fixture.capture(limits()).unwrap();
        fs::write(snapshot.root().join("file"), b"after").unwrap();
        if stream {
            fs::write(fixture.source.join("file:Zone.Identifier"), b"fixture").unwrap();
        } else {
            fs::hard_link(fixture.source.join("file"), fixture.root.join("outside")).unwrap();
        }
        assert!(matches!(
            snapshot.check_source_conflicts(limits(), &CancellationToken::default()),
            Err(SnapshotError::UnsupportedEntry { .. })
        ));
        assert_eq!(fs::read(fixture.source.join("file")).unwrap(), b"before");
        snapshot.close().unwrap();
    }
}

#[test]
fn source_check_rejects_reparse_ancestors_instead_of_following_outside_data() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.source.join("parent")).unwrap();
    fs::write(fixture.source.join("parent\\file"), b"before").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::write(snapshot.root().join("parent\\file"), b"after").unwrap();
    fs::rename(fixture.source.join("parent"), fixture.root.join("outside")).unwrap();
    junction(
        &fixture.source.join("parent"),
        &fixture.root.join("outside"),
    );
    assert!(matches!(
        snapshot.check_source_conflicts(limits(), &CancellationToken::default()),
        Err(SnapshotError::UnsupportedEntry { .. })
    ));
    assert_eq!(
        fs::read(fixture.root.join("outside\\file")).unwrap(),
        b"before"
    );
    fs::remove_dir(fixture.source.join("parent")).unwrap();
    snapshot.close().unwrap();
}

#[test]
fn source_check_protects_both_captured_and_new_git_descendants() {
    for existed_at_capture in [false, true] {
        let fixture = Fixture::new();
        fs::create_dir(fixture.source.join("parent")).unwrap();
        if existed_at_capture {
            fs::write(fixture.source.join("parent\\.git"), "gitdir: excluded").unwrap();
        }
        let snapshot = fixture.capture(limits()).unwrap();
        fs::remove_dir(snapshot.root().join("parent")).unwrap();
        if !existed_at_capture {
            fs::create_dir(fixture.source.join("parent\\.GIT")).unwrap();
        }
        assert!(matches!(
            snapshot.check_source_conflicts(limits(), &CancellationToken::default()),
            Err(SnapshotError::UnsupportedEntry {
                reason: "Git control descendants cannot be published",
                ..
            })
        ));
        snapshot.close().unwrap();
    }
}

#[test]
fn source_check_never_treats_sharing_errors_as_absent_files() {
    let fixture = Fixture::new();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::write(snapshot.root().join("added"), b"copy").unwrap();
    fs::write(fixture.source.join("added"), b"user").unwrap();
    let writer = OpenOptions::new()
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .open(fixture.source.join("added"))
        .unwrap();
    assert!(matches!(
        snapshot.check_source_conflicts(limits(), &CancellationToken::default()),
        Err(SnapshotError::Io {
            operation: "open source conflict target",
            ..
        })
    ));
    drop(writer);
    assert_eq!(check_source(&snapshot).conflicts.len(), 1);
    assert_eq!(fs::read(fixture.source.join("added")).unwrap(), b"user");
    snapshot.close().unwrap();
}
