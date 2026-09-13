use super::super::super::file_journal::tests::boundaries::junction;
use super::super::{
    anchor::{Anchor, MAX_COMPONENTS, components},
    known_folder,
};
use super::support::*;
use std::{fs, path::Path};

#[test]
fn path_parser_rejects_ambiguous_remote_device_or_excessively_deep_paths() {
    for path in [
        r"C:relative",
        r"\\server\share\folder",
        r"\\?\C:\folder",
        r"C:\a\..\b",
        r"C:\a\.\b",
        r"C:\a\\b",
        r"C:\a:stream",
        r"C:\a/b",
        "C:\\a ",
        "C:\\a.",
    ] {
        assert!(components(Path::new(path)).is_err());
    }
    let at_limit = format!(r"C:\{}", vec!["a"; MAX_COMPONENTS].join("\\"));
    assert_eq!(
        components(Path::new(&at_limit)).unwrap().1.len(),
        MAX_COMPONENTS
    );
    assert!(components(Path::new(&format!("{at_limit}\\a"))).is_err());
}

#[test]
fn redirected_ancestor_or_private_root_is_never_followed() {
    let fixture = Fixture::new();
    let target = Fixture::new();
    let link = fixture.0.join("redirect");
    junction(&link, &target.0);
    let token = CancellationToken::default();
    let guard = Guard::new(Duration::from_secs(15), &token).unwrap();
    assert!(Store::at(&link, true, &guard).is_err());
    assert!(!target.0.join(DIRECTORY).exists());
    fs::remove_dir(&link).unwrap();
    junction(&fixture.0.join(DIRECTORY), &target.0);
    assert!(store(&fixture, false).is_err());
    assert!(store(&fixture, true).is_err());
    assert_eq!(fs::read_dir(&target.0).unwrap().count(), 0);
    fs::remove_dir(fixture.0.join(DIRECTORY)).unwrap();
}

#[test]
#[ignore = "read-only current-user known-folder/ancestor permission probe; never initializes persistent storage"]
fn native_sandbox_store_anchor_uses_os_known_folder_without_creating_storage() {
    let path = known_folder::local_app_data().unwrap();
    let before = fs::metadata(path.join(DIRECTORY))
        .ok()
        .map(|metadata| metadata.is_dir());
    let token = CancellationToken::default();
    let guard = Guard::new(Duration::from_secs(15), &token).unwrap();
    let _anchor = Anchor::open(&path, &guard).unwrap();
    let after = fs::metadata(path.join(DIRECTORY))
        .ok()
        .map(|metadata| metadata.is_dir());
    assert_eq!(before, after);
}
