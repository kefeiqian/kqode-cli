use super::super::{super::SandboxAccountJournal, PrivateSandboxAccountJournal};
use super::support::*;
use std::{
    fs::{self, OpenOptions},
    os::windows::fs::OpenOptionsExt,
    path::Path,
    process::Command,
};
use windows_sys::Win32::{
    Security::{ImpersonateSelf, RevertToSelf, SecurityImpersonation},
    Storage::FileSystem::{FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT},
};

pub(in super::super) fn junction(link: &Path, target: &Path) {
    let result = Command::new("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
            "$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:KQODE_JOURNAL_LINK -Target $env:KQODE_JOURNAL_TARGET | Out-Null"])
        .env("KQODE_JOURNAL_LINK", link)
        .env("KQODE_JOURNAL_TARGET", target)
        .output().unwrap();
    assert!(
        result.status.success(),
        "fixture junction failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn junction_collision_does_not_touch_the_target_and_reparse_parent_is_rejected() {
    let fixture = Fixture::new();
    let target = Fixture::new();
    let (plan, passwords) = credentials();
    fs::write(target.0.join("sentinel"), b"unchanged").unwrap();
    let link = fixture.directory(&plan);
    junction(&link, &target.0);
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    assert!(journal.begin(&plan, &passwords).is_err());
    assert_eq!(fs::read_dir(&target.0).unwrap().count(), 1);
    assert_eq!(fs::read(target.0.join("sentinel")).unwrap(), b"unchanged");
    let handle = OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&link)
        .unwrap();
    assert!(PrivateSandboxAccountJournal::new(handle).is_err());
    fs::remove_dir(link).unwrap();
}

pub(in super::super) struct Impersonation;
impl Impersonation {
    pub(in super::super) fn begin() -> Self {
        assert_ne!(unsafe { ImpersonateSelf(SecurityImpersonation) }, 0);
        Self
    }
}
impl Drop for Impersonation {
    fn drop(&mut self) {
        assert_ne!(unsafe { RevertToSelf() }, 0);
    }
}

#[test]
fn impersonation_is_rejected_at_constructor_and_checked_again_before_creation() {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    {
        let _impersonation = Impersonation::begin();
        assert!(PrivateSandboxAccountJournal::new(fixture.parent()).is_err());
        assert!(journal.begin(&plan, &passwords).is_err());
    }
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    assert!(journal.begin(&plan, &passwords).is_err());
}
