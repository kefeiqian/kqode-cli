use super::{directory, handles, records};
use crate::runtime::workspace_snapshot::tests::support::{Fixture, junction};
use std::{fs, io::Read};

#[test]
fn child_open_and_enumeration_stay_on_pinned_directory_after_path_replacement() {
    let fixture = Fixture::new();
    let original = fixture.source.join("original");
    let outside = fixture.root.join("outside");
    fs::create_dir(&original).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(original.join("inside.txt"), "inside").unwrap();
    fs::write(outside.join("outside.txt"), "outside").unwrap();
    let root = handles::open_root(&fixture.source, false).unwrap();
    let pinned = handles::child(&root, "original".as_ref(), None).unwrap();
    fs::rename(&original, fixture.root.join("moved")).unwrap();
    junction(&original, &outside);
    let mut file = handles::child(&pinned, "inside.txt".as_ref(), None).unwrap();
    let mut text = String::new();
    file.read_to_string(&mut text).unwrap();
    assert_eq!(text, "inside");
    assert!(handles::child(&pinned, "outside.txt".as_ref(), None).is_err());
    let mut names = Vec::new();
    directory::visit(&pinned, |name| {
        names.push(name.to_owned());
        Ok(())
    })
    .unwrap();
    assert_eq!(names, vec![std::ffi::OsString::from("inside.txt")]);
}

#[test]
fn creation_never_overwrites_existing_files_or_aliases() {
    let fixture = Fixture::new();
    fs::write(fixture.root.join("outside.txt"), "original").unwrap();
    fs::hard_link(
        fixture.root.join("outside.txt"),
        fixture.staging.join("alias"),
    )
    .unwrap();
    let destination = handles::open_root(&fixture.staging, true).unwrap();
    assert!(handles::child(&destination, "alias".as_ref(), Some(false)).is_err());
    assert_eq!(
        fs::read_to_string(fixture.root.join("outside.txt")).unwrap(),
        "original"
    );
    for name in ["..", ".", "a\\b", "a/b", "a:stream", "bad\0name"] {
        assert!(handles::child(&destination, name.as_ref(), Some(false)).is_err());
    }
}

#[test]
fn native_record_parser_rejects_truncation_and_overlap() {
    assert!(records::names(&[], 8, 4).is_err());
    let mut bytes = vec![0u8; 16];
    bytes[4..8].copy_from_slice(&2u32.to_le_bytes());
    bytes[8..10].copy_from_slice(&u16::from(b'a').to_le_bytes());
    assert_eq!(
        records::names(&bytes, 8, 4).unwrap(),
        vec![std::ffi::OsString::from("a")]
    );
    bytes[..4].copy_from_slice(&4u32.to_le_bytes());
    assert!(records::names(&bytes, 8, 4).is_err());
    bytes[..4].copy_from_slice(&0u32.to_le_bytes());
    bytes[4..8].copy_from_slice(&100u32.to_le_bytes());
    assert!(records::names(&bytes, 8, 4).is_err());
}

#[test]
fn snapshot_root_starts_with_a_private_non_inherited_dacl() {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::{
            Authorization::{GetSecurityInfo, SE_FILE_OBJECT},
            DACL_SECURITY_INFORMATION, GetSecurityDescriptorControl, SE_DACL_PROTECTED,
        },
    };
    let fixture = Fixture::new();
    let snapshot = fixture
        .capture(crate::runtime::workspace_snapshot::tests::support::limits())
        .unwrap();
    let directory = snapshot.directory.as_ref().unwrap();
    let mut descriptor = std::ptr::null_mut();
    let mut dacl = std::ptr::null_mut();
    let result = unsafe {
        GetSecurityInfo(
            directory.as_raw_handle().cast(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut dacl,
            std::ptr::null_mut(),
            &mut descriptor,
        )
    };
    assert_eq!(result, 0);
    assert!(!dacl.is_null());
    let mut control = 0;
    let mut revision = 0;
    let queried = unsafe { GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) };
    let count = unsafe { (*dacl).AceCount };
    unsafe {
        LocalFree(descriptor);
    }
    assert_ne!(queried, 0);
    assert_ne!(control & SE_DACL_PROTECTED, 0);
    assert_eq!(count, 2);
    snapshot.close().unwrap();
    fixture.assert_clean();
}
