use super::super::SnapshotError;
use super::{directory, handles};
use crate::cancellation::CancellationToken;
use std::{
    fs::{File, OpenOptions},
    io,
    os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
    GetFileInformationByHandle, READ_CONTROL, WRITE_DAC,
};

const MAX_ACCESS_DEPTH: usize = 64;

pub(in crate::runtime::workspace_snapshot) fn collect(
    root: &File,
    limit: usize,
    cancellation: &CancellationToken,
) -> Result<Vec<File>, SnapshotError> {
    let mut files = Vec::new();
    visit(root, &mut files, limit, 0, cancellation)?;
    Ok(files)
}

fn visit(
    file: &File,
    files: &mut Vec<File>,
    limit: usize,
    depth: usize,
    cancel: &CancellationToken,
) -> Result<(), SnapshotError> {
    if cancel.is_cancelled() {
        return Err(SnapshotError::Cancelled);
    }
    if files.len() >= limit || depth > MAX_ACCESS_DEPTH {
        return Err(SnapshotError::LimitExceeded("native ACL entries/depth"));
    }
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(file.as_raw_handle().cast(), &mut info) } == 0 {
        return Err(SnapshotError::io(
            "inspect native ACL target",
            io::Error::last_os_error(),
        ));
    }
    let is_directory = info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0;
    if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || (!is_directory && info.nNumberOfLinks != 1)
    {
        return Err(SnapshotError::io(
            "validate native ACL target",
            io::Error::other(
                "copy contains a reparse point or hardlink; recapture before execution",
            ),
        ));
    }
    let path = handles::final_path(file)
        .map_err(|error| SnapshotError::io("resolve native ACL target", error))?;
    let writable = OpenOptions::new()
        .read(true)
        .access_mode(READ_CONTROL | WRITE_DAC)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|error| SnapshotError::io("pin native ACL target", error))?;
    let mut opened = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(writable.as_raw_handle().cast(), &mut opened) } == 0 {
        return Err(SnapshotError::io(
            "verify native ACL target identity",
            io::Error::last_os_error(),
        ));
    }
    if (
        opened.dwVolumeSerialNumber,
        opened.nFileIndexHigh,
        opened.nFileIndexLow,
    ) != (
        info.dwVolumeSerialNumber,
        info.nFileIndexHigh,
        info.nFileIndexLow,
    ) || opened.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || (!is_directory && opened.nNumberOfLinks != 1)
    {
        return Err(SnapshotError::io(
            "verify native ACL target identity",
            io::Error::other("private copy changed during access preparation"),
        ));
    }
    files.push(writable);
    if is_directory {
        directory::visit(file, |name| {
            let child = handles::child(file, name, None)
                .map_err(|error| SnapshotError::io("open native ACL target", error))?;
            visit(&child, files, limit, depth + 1, cancel)
        })?;
    }
    Ok(())
}
