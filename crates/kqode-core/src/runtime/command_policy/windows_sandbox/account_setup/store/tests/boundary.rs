use super::super::super::file_journal::tests::boundaries::junction;
use super::super::{AccountStoreBoundary, overlap::overlaps};
use super::support::*;
use crate::runtime::windows_file::open_directory;
use std::{fs, path::Path};
use windows_sys::Win32::Storage::FileSystem::FILE_DELETE_CHILD;

fn boundary(fixture: &Fixture) -> Result<AccountStoreBoundary, Error> {
    let token = CancellationToken::default();
    let guard = Guard::new(Duration::from_secs(15), &token).unwrap();
    AccountStoreBoundary::at(&fixture.0, &guard)
}

#[test]
fn namespace_overlap_is_component_wise_symmetric_and_case_insensitive() {
    let protected =
        Path::new(r"\\?\Volume{00000000-0000-0000-0000-000000000001}\User\KQodeSandbox");
    for (path, expected) in [
        (
            r"\\?\Volume{00000000-0000-0000-0000-000000000001}\USER",
            true,
        ),
        (
            r"\\?\Volume{00000000-0000-0000-0000-000000000001}\user\kqodesandbox",
            true,
        ),
        (
            r"\\?\Volume{00000000-0000-0000-0000-000000000001}\User\KQodeSandbox\child",
            true,
        ),
        (
            r"\\?\Volume{00000000-0000-0000-0000-000000000001}\User\KQodeSandbox-other",
            false,
        ),
        (
            r"\\?\Volume{00000000-0000-0000-0000-000000000002}\User\KQodeSandbox",
            false,
        ),
    ] {
        assert_eq!(overlaps(Path::new(path), protected).unwrap(), expected);
        assert_eq!(overlaps(protected, Path::new(path)).unwrap(), expected);
    }
    assert!(
        overlaps(
            Path::new("C:\\\u{00d6}wner\\Store"),
            Path::new("c:\\\u{00f6}wner")
        )
        .unwrap()
    );
}

#[test]
fn missing_store_is_reserved_without_creating_state_or_blocking_siblings() {
    let fixture = Fixture::new();
    let boundary = boundary(&fixture).unwrap();
    let ancestor = open_directory(&fixture.0, false).unwrap();
    assert!(matches!(
        boundary.check_directory(&ancestor),
        Err(Error::ProtectedStorageOverlap)
    ));
    let sibling = fixture.0.join("KQodeSandbox-other");
    fs::create_dir(&sibling).unwrap();
    assert!(
        boundary
            .check_directory(&open_directory(&sibling, false).unwrap())
            .is_ok()
    );
    assert!(!fixture.0.join(DIRECTORY).exists());
}

#[test]
fn existing_private_root_descendants_and_resolved_junction_aliases_are_rejected() {
    let fixture = Fixture::new();
    drop(store(&fixture, true).unwrap());
    let root = fixture.0.join(DIRECTORY);
    fs::create_dir(root.join("child")).unwrap();
    let boundary = boundary(&fixture).unwrap();
    let link = fixture.0.join("alias");
    junction(&link, &root);
    for path in [&root, &root.join("child"), &link] {
        let resolved = fs::canonicalize(path).unwrap();
        let handle = open_directory(&resolved, false).unwrap();
        assert!(matches!(
            boundary.check_directory(&handle),
            Err(Error::ProtectedStorageOverlap)
        ));
    }
    fs::remove_dir(link).unwrap();
    assert!(fs::rename(&root, fixture.0.join("moved")).is_err());
}

#[test]
fn redirected_or_non_private_store_and_changed_ancestor_fail_closed() {
    let fixture = Fixture::new();
    let target = Fixture::new();
    junction(&fixture.0.join(DIRECTORY), &target.0);
    assert!(boundary(&fixture).is_err());
    fs::remove_dir(fixture.0.join(DIRECTORY)).unwrap();
    drop(store(&fixture, true).unwrap());
    grant(&fixture.0.join(DIRECTORY), FILE_DELETE_CHILD);
    assert!(boundary(&fixture).is_err());

    let fresh = Fixture::new();
    let boundary = boundary(&fresh).unwrap();
    grant(&fresh.0, FILE_DELETE_CHILD);
    assert!(
        boundary
            .verify(Duration::from_secs(15), &CancellationToken::default())
            .is_err()
    );
}
