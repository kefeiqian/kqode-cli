use super::private_acl::{self, invalid};
use crate::runtime::windows_streams::has_named_stream;
use std::{
    fs::File,
    io,
    os::windows::{fs::MetadataExt, io::AsRawHandle},
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_STANDARD_INFO, FileStandardInfo,
    GetFileInformationByHandleEx,
};

/// Verifies existing private storage without reopening it through a mutable pathname.
pub(super) fn verify(file: &File, directory: bool) -> io::Result<()> {
    let metadata = file.metadata()?;
    if metadata.is_dir() != directory
        || (!directory && !metadata.is_file())
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(invalid(
            "private storage object type or reparse attributes are invalid",
        ));
    }
    let mut info = FILE_STANDARD_INFO::default();
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle().cast(),
            FileStandardInfo,
            (&mut info as *mut FILE_STANDARD_INFO).cast(),
            size_of::<FILE_STANDARD_INFO>() as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if info.DeletePending || (!directory && info.NumberOfLinks != 1) {
        return Err(invalid(
            "private storage object is pending deletion or has hardlink aliases",
        ));
    }
    private_acl::verify(file)?;
    if has_named_stream(file, directory)? {
        return Err(invalid("private storage object has named streams"));
    }
    Ok(())
}
