use std::{fs::File, io, os::windows::io::AsRawHandle, path::Path};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
};

use super::{super::SnapshotError, ObjectIdentity, entry::unsupported, handles};

/// Reopens the owned object, giving concurrent inspectors independent enumeration cursors.
pub(super) fn root(file: &File) -> Result<File, SnapshotError> {
    let original = ObjectIdentity::read(file)?;
    let path = handles::final_path(file)
        .map_err(|error| SnapshotError::io("resolve inspection root", error))?;
    let opened = handles::open_root(&path, false)
        .map_err(|error| SnapshotError::io("open inspection root", error))?;
    if original != ObjectIdentity::read(&opened)? || original != ObjectIdentity::read(file)? {
        return Err(SnapshotError::SnapshotMoved);
    }
    Ok(opened)
}

/// Rejects file aliases before reading or accepting a final observation.
pub(super) fn single_link(file: &File, path: &Path) -> Result<(), SnapshotError> {
    if information(file)?.nNumberOfLinks != 1 {
        return Err(unsupported(path, "hard-linked artifacts are not supported"));
    }
    Ok(())
}

fn information(file: &File) -> Result<BY_HANDLE_FILE_INFORMATION, SnapshotError> {
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(file.as_raw_handle().cast(), &mut info) } == 0 {
        return Err(SnapshotError::io(
            "inspect artifact identity",
            io::Error::last_os_error(),
        ));
    }
    Ok(info)
}
