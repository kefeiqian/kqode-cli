use super::super::super::tests::boundaries::{Impersonation, junction};
use super::support::*;
use std::{
    fs::{self, OpenOptions},
    os::windows::fs::OpenOptionsExt,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ALL_ACCESS, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_GENERIC_READ,
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

#[test]
fn broader_directory_or_file_dacls_are_rejected_without_repair() {
    for directory in [true, false] {
        let (fixture, plan) = disk();
        let target = if directory {
            fixture.directory(&plan)
        } else {
            fixture.journal(&plan)
        };
        let handle = OpenOptions::new()
            .access_mode(FILE_ALL_ACCESS)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&target)
            .unwrap();
        crate::runtime::command_policy::windows_sandbox::acl::grant(
            &[handle],
            "S-1-1-0",
            FILE_GENERIC_READ,
        )
        .unwrap();
        let before = fs::read(fixture.journal(&plan)).unwrap();
        assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
        assert_eq!(fs::read(fixture.journal(&plan)).unwrap(), before);
        assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    }
}

#[test]
fn redirected_installation_and_file_type_substitution_are_rejected() {
    let fixture = Fixture::new();
    let (target, plan) = disk();
    let link = fixture.directory(&plan);
    junction(&link, &target.directory(&plan));
    let before = fs::read(target.journal(&plan)).unwrap();
    assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    assert_eq!(fs::read(target.journal(&plan)).unwrap(), before);
    fs::remove_dir(link).unwrap();
    let (fixture, plan) = disk();
    fs::remove_file(fixture.journal(&plan)).unwrap();
    fs::create_dir(fixture.journal(&plan)).unwrap();
    assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
}

#[test]
fn active_writers_and_thread_impersonation_block_inspection() {
    let (fixture, plan) = disk();
    let writer = OpenOptions::new()
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .open(fixture.journal(&plan))
        .unwrap();
    assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    drop(writer);
    {
        let _impersonation = Impersonation::begin();
        assert!(Journal::inspect(&fixture.parent(), &plan).is_err());
    }
    assert!(Journal::inspect(&fixture.parent(), &plan).is_ok());
}
