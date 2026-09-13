use super::support::*;
use std::fs;
use windows_sys::Win32::{
    Foundation::{GENERIC_ALL, GENERIC_WRITE},
    Storage::FileSystem::{
        DELETE, FILE_ADD_SUBDIRECTORY, FILE_DELETE_CHILD, FILE_GENERIC_READ, FILE_WRITE_ATTRIBUTES,
        FILE_WRITE_EA, WRITE_DAC, WRITE_OWNER,
    },
};

#[test]
fn unsafe_ancestor_grants_fail_before_creating_the_private_namespace() {
    for mask in [
        DELETE,
        WRITE_DAC,
        WRITE_OWNER,
        FILE_DELETE_CHILD,
        FILE_WRITE_EA,
        FILE_WRITE_ATTRIBUTES,
        GENERIC_ALL,
        GENERIC_WRITE,
    ] {
        let fixture = Fixture::new();
        grant(&fixture.0, mask);
        assert!(store(&fixture, true).is_err());
        assert!(!fixture.0.join(DIRECTORY).exists());
    }
}

#[test]
fn read_and_sibling_creation_rights_do_not_grant_access_to_private_children() {
    for mask in [FILE_GENERIC_READ, FILE_ADD_SUBDIRECTORY] {
        let fixture = Fixture::new();
        grant(&fixture.0, mask);
        let store = store(&fixture, true).unwrap();
        super::super::super::private_object::verify(&store.root, true).unwrap();
    }
}

#[test]
fn broadened_root_or_ancestor_rights_are_rejected_by_live_operations() {
    for root in [false, true] {
        let fixture = Fixture::new();
        let store = store(&fixture, true).unwrap();
        grant(
            &if root {
                fixture.0.join(DIRECTORY)
            } else {
                fixture.0.clone()
            },
            FILE_DELETE_CHILD,
        );
        assert!(
            store
                .inspect(Duration::from_secs(15), &CancellationToken::default())
                .is_err()
        );
        assert_eq!(fs::read_dir(fixture.0.join(DIRECTORY)).unwrap().count(), 1);
    }
}

#[test]
fn marker_hardlinks_and_named_streams_are_rejected() {
    for alias in [false, true] {
        let fixture = Fixture::new();
        drop(store(&fixture, true).unwrap());
        let marker = fixture.0.join(DIRECTORY).join(FILENAME);
        if alias {
            fs::hard_link(&marker, fixture.0.join("alias")).unwrap();
        } else {
            fs::write(format!("{}:extra", marker.display()), b"extra").unwrap();
        }
        assert!(store(&fixture, false).is_err());
    }
}
