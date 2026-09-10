use std::{ffi::OsStr, fs::File, io, os::windows::io::AsRawHandle};

use windows_sys::Win32::{
    Foundation::{ERROR_HANDLE_EOF, ERROR_NO_MORE_FILES},
    Storage::FileSystem::{
        FILE_ID_BOTH_DIR_INFO, FILE_STREAM_INFO, FileIdBothDirectoryInfo,
        FileIdBothDirectoryRestartInfo, FileStreamInfo, GetFileInformationByHandleEx,
    },
};

use super::super::SnapshotError;
use super::records;

const QUERY_BYTES: usize = 64 * 1024;

/// Enumerates the directory handle itself, even if a path is concurrently redirected.
pub(super) fn visit(
    directory: &File,
    mut visitor: impl FnMut(&OsStr) -> Result<(), SnapshotError>,
) -> Result<(), SnapshotError> {
    let mut storage = vec![0u64; QUERY_BYTES / size_of::<u64>()];
    let mut class = FileIdBothDirectoryRestartInfo;
    loop {
        if unsafe {
            GetFileInformationByHandleEx(
                directory.as_raw_handle().cast(),
                class,
                storage.as_mut_ptr().cast(),
                QUERY_BYTES as u32,
            )
        } == 0
        {
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(ERROR_NO_MORE_FILES as i32) {
                return Ok(());
            }
            return Err(SnapshotError::io("enumerate source directory", error));
        }
        class = FileIdBothDirectoryInfo;
        let bytes =
            unsafe { std::slice::from_raw_parts(storage.as_ptr().cast::<u8>(), QUERY_BYTES) };
        let names = records::names(
            bytes,
            std::mem::offset_of!(FILE_ID_BOTH_DIR_INFO, FileName),
            std::mem::offset_of!(FILE_ID_BOTH_DIR_INFO, FileNameLength),
        )
        .map_err(|error| SnapshotError::io("decode directory records", error))?;
        for name in names {
            if name != "." && name != ".." {
                visitor(&name)?;
            }
        }
    }
}

/// Rejects named streams instead of silently stripping metadata such as Mark-of-the-Web.
pub(super) fn has_named_stream(file: &File, is_directory: bool) -> io::Result<bool> {
    let mut storage = vec![0u64; QUERY_BYTES / size_of::<u64>()];
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle().cast(),
            FileStreamInfo,
            storage.as_mut_ptr().cast(),
            QUERY_BYTES as u32,
        )
    } == 0
    {
        let error = io::Error::last_os_error();
        if is_directory && error.raw_os_error() == Some(ERROR_HANDLE_EOF as i32) {
            return Ok(false);
        }
        return Err(error);
    }
    let bytes = unsafe { std::slice::from_raw_parts(storage.as_ptr().cast::<u8>(), QUERY_BYTES) };
    if is_directory && bytes.iter().all(|byte| *byte == 0) {
        return Ok(false);
    }
    let names = records::names(
        bytes,
        std::mem::offset_of!(FILE_STREAM_INFO, StreamName),
        std::mem::offset_of!(FILE_STREAM_INFO, StreamNameLength),
    )?;
    Ok(names.iter().any(|name| name != "::$DATA"))
}
