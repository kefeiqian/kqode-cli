use std::{
    ffi::OsStr,
    fs::{File, OpenOptions},
    io,
    os::windows::{ffi::OsStringExt, fs::OpenOptionsExt, io::AsRawHandle},
    path::PathBuf,
};

use super::child_handle::open_child;
use crate::runtime::windows_security::PrivateDescriptor;
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, GetFinalPathNameByHandleW,
    VOLUME_NAME_GUID,
};

/// Opens the root itself without following a final reparse point.
pub(super) fn open_root(path: &std::path::Path, writable: bool) -> io::Result<File> {
    use std::os::windows::fs::MetadataExt;
    let file = OpenOptions::new()
        .read(true)
        .write(writable)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::Error::other(
            "snapshot root must be a non-reparse directory",
        ));
    }
    Ok(file)
}

/// Opens exactly one component beneath an already opened directory.
pub(super) fn child(parent: &File, name: &OsStr, create: Option<bool>) -> io::Result<File> {
    open_child(
        parent,
        name,
        create,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        false,
    )
}

/// Denies ordinary write/delete sharing while an artifact is inspected.
pub(super) fn inspection_child(parent: &File, name: &OsStr) -> io::Result<File> {
    open_child(parent, name, None, FILE_SHARE_READ, None, false)
}

/// Uses native case-insensitive matching so source aliases are not mistaken for absence.
pub(super) fn source_child(parent: &File, name: &OsStr) -> io::Result<File> {
    open_child(parent, name, None, FILE_SHARE_READ, None, true)
}

pub(super) fn snapshot_root(parent: &File, name: &OsStr) -> io::Result<File> {
    let descriptor = PrivateDescriptor::new()?;
    open_child(
        parent,
        name,
        Some(true),
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        Some(&descriptor),
        false,
    )
}

pub(in crate::runtime::workspace_snapshot) fn final_path(file: &File) -> io::Result<PathBuf> {
    path_by_handle(file, 0)
}

pub(super) fn volume_path(file: &File) -> io::Result<PathBuf> {
    path_by_handle(file, VOLUME_NAME_GUID)
}

fn path_by_handle(file: &File, flags: u32) -> io::Result<PathBuf> {
    let mut buffer = vec![0u16; 512];
    loop {
        let count = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle().cast(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                flags,
            )
        };
        if count == 0 {
            return Err(io::Error::last_os_error());
        }
        if (count as usize) < buffer.len() {
            return Ok(PathBuf::from(std::ffi::OsString::from_wide(
                &buffer[..count as usize],
            )));
        }
        buffer.resize(count as usize + 1, 0);
    }
}
