use super::windows_records;
use std::{fs::File, io, os::windows::io::AsRawHandle};
use windows_sys::Win32::{
    Foundation::ERROR_HANDLE_EOF,
    Storage::FileSystem::{FILE_STREAM_INFO, FileStreamInfo, GetFileInformationByHandleEx},
};

const QUERY_BYTES: usize = 64 * 1024;

/// Queries streams on an already-open object without following a second path.
pub(crate) fn has_named_stream(file: &File, is_directory: bool) -> io::Result<bool> {
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
    let names = windows_records::names(
        bytes,
        std::mem::offset_of!(FILE_STREAM_INFO, StreamName),
        std::mem::offset_of!(FILE_STREAM_INFO, StreamNameLength),
    )?;
    Ok(names.iter().any(|name| name != "::$DATA"))
}
