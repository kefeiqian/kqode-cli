pub(super) use super::super::super::{SandboxAccountSetupError as Error, guard::Guard};
pub(super) use super::super::{
    WindowsSandboxAccountStore as Store, marker::FILENAME, storage::DIRECTORY,
};
pub(super) use crate::cancellation::CancellationToken;
pub(super) use std::time::Duration;
use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt, path::Path};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_GENERIC_READ, WRITE_DAC,
};

/// Temp may legitimately be sandbox-writable; fixtures need a genuinely trusted ancestor chain.
pub struct Fixture(pub std::path::PathBuf);

impl Fixture {
    pub fn new() -> Self {
        let path = super::super::known_folder::local_app_data().unwrap();
        let token = CancellationToken::default();
        let guard = Guard::new(Duration::from_secs(15), &token).unwrap();
        let anchor = super::super::anchor::Anchor::open(&path, &guard).unwrap();
        let name = format!("kqode-account-store-test-{}", uuid::Uuid::new_v4());
        let descriptor = crate::runtime::windows_security::PrivateDescriptor::new().unwrap();
        let child = crate::runtime::windows_file::open_child(
            anchor.parent(),
            std::ffi::OsStr::new(&name),
            Some(true),
            0,
            Some(&descriptor),
            true,
        )
        .unwrap();
        drop(child);
        Self(path.join(name))
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            eprintln!("private store fixture cleanup failed: {error}");
        }
    }
}

pub fn store(fixture: &Fixture, create: bool) -> Result<Store, Error> {
    let token = CancellationToken::default();
    let guard = Guard::new(Duration::from_secs(15), &token).unwrap();
    Store::at(&fixture.0, create, &guard)
}

pub fn grant(path: &Path, mask: u32) {
    let file = OpenOptions::new()
        .access_mode(WRITE_DAC | FILE_GENERIC_READ)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .unwrap();
    crate::runtime::command_policy::windows_sandbox::acl::grant(&[file], "S-1-1-0", mask).unwrap();
}
