use super::{
    super::WindowsSandboxAccountPlan,
    records::{self, Record},
};
use crate::runtime::{
    windows_file::{open_child, volume_path},
    windows_security::PrivateDescriptor,
};
use std::{
    ffi::OsStr,
    fs::File,
    io,
    os::windows::{
        fs::MetadataExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    ptr,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_TYPE_DISK, GetFileType,
    GetVolumeInformationByHandleW,
};
use windows_sys::Win32::System::SystemServices::FILE_PERSISTENT_ACLS;
use windows_sys::Win32::{
    Foundation::{ERROR_NO_TOKEN, GetLastError},
    Security::TOKEN_QUERY,
    System::Threading::{GetCurrentThread, OpenThreadToken},
};

pub(super) const JOURNAL_FILENAME: &str = "accounts.jsonl";

pub(super) fn directory_name(plan: &WindowsSandboxAccountPlan) -> String {
    format!("sandbox-setup-{}", plan.installation_id())
}

/// Holds the private directory and exclusive file open until the journal is dropped.
pub(super) struct Storage {
    _directory: File,
    file: File,
}

impl Storage {
    pub fn create(parent: &File, plan: &WindowsSandboxAccountPlan) -> io::Result<Self> {
        require_process_identity()?;
        let descriptor = PrivateDescriptor::new()?;
        let directory = open_child(
            parent,
            OsStr::new(&directory_name(plan)),
            Some(true),
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            Some(&descriptor),
            true,
        )?;
        let file = open_child(
            &directory,
            OsStr::new(JOURNAL_FILENAME),
            Some(false),
            0,
            Some(&descriptor),
            true,
        )?;
        Ok(Self {
            _directory: directory,
            file,
        })
    }

    pub fn append(&mut self, record: &Record<'_>) -> io::Result<()> {
        records::append(&mut self.file, record)
    }
}

/// Rejects non-directory/reparse handles and storage without local persistent ACL support.
pub(super) fn validate_parent(parent: &File) -> io::Result<()> {
    require_process_identity()?;
    let metadata = parent.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::Error::other(
            "sandbox journal parent must be a non-reparse directory",
        ));
    }
    if unsafe { GetFileType(parent.as_raw_handle().cast()) } != FILE_TYPE_DISK {
        return Err(io::Error::other("sandbox journal requires disk storage"));
    }
    let path = volume_path(parent)?;
    if !path
        .as_os_str()
        .to_string_lossy()
        .starts_with(r"\\?\Volume{")
    {
        return Err(io::Error::other(
            "sandbox journal requires a local volume-GUID path",
        ));
    }
    let mut flags = 0;
    if unsafe {
        GetVolumeInformationByHandleW(
            parent.as_raw_handle().cast(),
            ptr::null_mut(),
            0,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut flags,
            ptr::null_mut(),
            0,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if flags & FILE_PERSISTENT_ACLS == 0 {
        return Err(io::Error::other(
            "sandbox journal requires persistent filesystem ACLs",
        ));
    }
    Ok(())
}

/// Descriptor principals must match the creator, not a helper thread's impersonated client.
fn require_process_identity() -> io::Result<()> {
    let mut token = ptr::null_mut();
    if unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, 1, &mut token) } != 0 {
        if !token.is_null() {
            drop(unsafe { OwnedHandle::from_raw_handle(token.cast()) });
        }
        return Err(io::Error::other(
            "sandbox journal creation refuses thread impersonation",
        ));
    }
    let error = unsafe { GetLastError() };
    if error != ERROR_NO_TOKEN {
        return Err(io::Error::from_raw_os_error(error as i32));
    }
    Ok(())
}
