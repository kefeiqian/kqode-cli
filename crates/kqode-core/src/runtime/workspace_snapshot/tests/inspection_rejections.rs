use std::{
    fs::{self, OpenOptions},
    os::windows::fs::OpenOptionsExt,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

use super::super::SnapshotError;
use super::support::{Fixture, junction, limits};
use crate::cancellation::CancellationToken;

#[test]
fn inspection_rejects_outside_aliases_without_reading_or_mutating_their_targets() {
    for link_directory in [false, true] {
        let fixture = Fixture::new();
        let outside = fixture.root.join("outside");
        fs::create_dir(&outside).unwrap();
        let marker = outside.join("marker");
        fs::write(&marker, b"outside").unwrap();
        let snapshot = fixture.capture(limits()).unwrap();
        let alias = snapshot.root().join("alias");
        if link_directory {
            junction(&alias, &outside);
        } else {
            fs::hard_link(&marker, &alias).unwrap();
        }
        assert!(matches!(
            snapshot.inspect_changes(limits(), &CancellationToken::default()),
            Err(SnapshotError::UnsupportedEntry { .. })
        ));
        assert_eq!(fs::read(&marker).unwrap(), b"outside");
        if link_directory {
            fs::remove_dir(alias).unwrap();
        } else {
            fs::remove_file(alias).unwrap();
        }
        snapshot.close().unwrap();
        assert_eq!(fs::read(marker).unwrap(), b"outside");
    }
}

#[test]
fn inspection_rejects_file_directory_and_root_named_streams() {
    for kind in ["file", "directory", "root"] {
        let fixture = Fixture::new();
        let snapshot = fixture.capture(limits()).unwrap();
        let target = if kind == "root" {
            snapshot.root().to_owned()
        } else {
            let target = snapshot.root().join("item");
            if kind == "file" {
                fs::write(&target, []).unwrap();
            } else {
                fs::create_dir(&target).unwrap();
            }
            target
        };
        let mut stream = target.into_os_string();
        stream.push(":Zone.Identifier");
        fs::write(&stream, b"fixture").unwrap();
        assert!(matches!(
            snapshot.inspect_changes(limits(), &CancellationToken::default()),
            Err(SnapshotError::UnsupportedEntry {
                reason: "named data streams are not supported",
                ..
            })
        ));
        fs::remove_file(stream).unwrap();
        snapshot.close().unwrap();
    }
}

#[test]
fn inspection_rejects_new_git_controls_and_special_win32_names() {
    for name in [".git", ".GIT", "trailing."] {
        let fixture = Fixture::new();
        let snapshot = fixture.capture(limits()).unwrap();
        fs::write(snapshot.root().join(name), b"fixture").unwrap();
        assert!(matches!(
            snapshot.inspect_changes(limits(), &CancellationToken::default()),
            Err(SnapshotError::UnsupportedEntry { .. })
        ));
        snapshot.close().unwrap();
    }
}

#[test]
fn inspection_refuses_an_open_writer_instead_of_returning_a_partial_report() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), b"before").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    let writer = OpenOptions::new()
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .open(snapshot.root().join("file"))
        .unwrap();
    assert!(matches!(
        snapshot.inspect_changes(limits(), &CancellationToken::default()),
        Err(SnapshotError::Io {
            operation: "open artifact entry",
            ..
        })
    ));
    drop(writer);
    assert!(
        snapshot
            .inspect_changes(limits(), &CancellationToken::default())
            .unwrap()
            .is_empty()
    );
    snapshot.close().unwrap();
}
