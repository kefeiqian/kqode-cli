use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, FileTimes},
    path::PathBuf,
};

use super::super::{SnapshotChange, SnapshotEntry};
use super::support::{Fixture, limits};
use crate::cancellation::CancellationToken;

fn content(bytes: &[u8]) -> SnapshotEntry {
    SnapshotEntry::File {
        bytes: bytes.len() as u64,
        sha256: Sha256::digest(bytes).into(),
    }
}

#[test]
fn inspection_reports_exact_sorted_changes_and_preserves_the_copy_time_baseline() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("modified"), b"abc").unwrap();
    fs::write(fixture.source.join("deleted"), b"old").unwrap();
    fs::write(fixture.source.join("unchanged"), [0, 255, 1]).unwrap();
    fs::create_dir(fixture.source.join("directory-to-file")).unwrap();
    fs::write(fixture.source.join("file-to-directory"), b"file").unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    let cancel = CancellationToken::default();
    assert_eq!(snapshot.inspect_changes(limits(), &cancel).unwrap(), vec![]);
    let modified = snapshot.root().join("modified");
    let time = fs::metadata(&modified).unwrap().modified().unwrap();
    fs::write(&modified, b"xyz").unwrap();
    File::options()
        .write(true)
        .open(&modified)
        .unwrap()
        .set_times(FileTimes::new().set_modified(time))
        .unwrap();
    fs::remove_file(snapshot.root().join("deleted")).unwrap();
    fs::remove_dir(snapshot.root().join("directory-to-file")).unwrap();
    fs::write(snapshot.root().join("directory-to-file"), b"new").unwrap();
    fs::remove_file(snapshot.root().join("file-to-directory")).unwrap();
    fs::create_dir(snapshot.root().join("file-to-directory")).unwrap();
    fs::create_dir(snapshot.root().join("added")).unwrap();
    fs::write(snapshot.root().join("added\\binary"), [255, 0]).unwrap();

    let expected = vec![
        SnapshotChange::Added {
            path: "added".into(),
            entry: SnapshotEntry::Directory,
        },
        SnapshotChange::Added {
            path: "added\\binary".into(),
            entry: content(&[255, 0]),
        },
        SnapshotChange::Deleted {
            path: "deleted".into(),
            entry: content(b"old"),
        },
        SnapshotChange::Modified {
            path: "directory-to-file".into(),
            before: SnapshotEntry::Directory,
            after: content(b"new"),
        },
        SnapshotChange::Modified {
            path: "file-to-directory".into(),
            before: content(b"file"),
            after: SnapshotEntry::Directory,
        },
        SnapshotChange::Modified {
            path: "modified".into(),
            before: SnapshotEntry::File {
                bytes: 3,
                sha256: [
                    0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d,
                    0xae, 0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10,
                    0xff, 0x61, 0xf2, 0x00, 0x15, 0xad,
                ],
            },
            after: content(b"xyz"),
        },
    ];
    assert_eq!(
        snapshot.inspect_changes(limits(), &cancel).unwrap(),
        expected
    );
    assert_eq!(
        snapshot.inspect_changes(limits(), &cancel).unwrap(),
        expected
    );
    assert_eq!(fs::read(fixture.source.join("modified")).unwrap(), b"abc");
    assert_eq!(fs::read(fixture.source.join("deleted")).unwrap(), b"old");
    assert!(!fixture.source.join("added").exists());
    fs::write(&modified, b"abc").unwrap();
    let changes = snapshot.inspect_changes(limits(), &cancel).unwrap();
    assert_eq!(changes, expected[..expected.len() - 1]);
    snapshot.close().unwrap();
    fixture.assert_clean();
}

#[test]
fn inspection_does_not_read_the_source_or_turn_excluded_git_metadata_into_deletions() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), b"abc").unwrap();
    fs::write(fixture.source.join(".git"), "gitdir: not-copied").unwrap();
    fs::create_dir(fixture.source.join("empty")).unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    fs::remove_dir_all(&fixture.source).unwrap();
    assert!(
        snapshot
            .inspect_changes(limits(), &CancellationToken::default())
            .unwrap()
            .is_empty()
    );
    fs::rename(snapshot.root().join("file"), snapshot.root().join("FILE")).unwrap();
    fs::remove_dir(snapshot.root().join("empty")).unwrap();
    let changes = snapshot
        .inspect_changes(limits(), &CancellationToken::default())
        .unwrap();
    assert_eq!(
        changes,
        vec![
            SnapshotChange::Added {
                path: PathBuf::from("FILE"),
                entry: content(b"abc")
            },
            SnapshotChange::Deleted {
                path: PathBuf::from("empty"),
                entry: SnapshotEntry::Directory
            },
            SnapshotChange::Deleted {
                path: PathBuf::from("file"),
                entry: content(b"abc")
            },
        ]
    );
    snapshot.close().unwrap();
}

#[test]
fn inspection_hashes_multiple_chunks_and_empty_files_without_text_decoding() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("file"), []).unwrap();
    let snapshot = fixture.capture(limits()).unwrap();
    let bytes: Vec<u8> = (0..131_089).map(|index| (index % 256) as u8).collect();
    fs::write(snapshot.root().join("file"), &bytes).unwrap();
    fs::write(snapshot.root().join("empty"), []).unwrap();
    let changes = snapshot
        .inspect_changes(limits(), &CancellationToken::default())
        .unwrap();
    assert_eq!(
        changes,
        vec![
            SnapshotChange::Added {
                path: "empty".into(),
                entry: content(b"")
            },
            SnapshotChange::Modified {
                path: "file".into(),
                before: content(b""),
                after: content(&bytes),
            },
        ]
    );
    snapshot.close().unwrap();
}
