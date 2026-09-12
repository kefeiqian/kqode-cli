use std::{fs::File, io, os::windows::io::AsRawHandle, path::PathBuf};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ID_INFO, FileIdInfo, GetFileInformationByHandleEx,
};

use super::{super::SnapshotError, handles};

/// Volume-qualified 128-bit object identity and the frozen volume-GUID path.
#[derive(Eq, PartialEq)]
pub(in crate::runtime::workspace_snapshot) struct ObjectIdentity {
    volume: u64,
    file: [u8; 16],
    path: PathBuf,
}

impl ObjectIdentity {
    /// Captures identity through an existing handle; unsupported filesystems fail closed.
    pub(super) fn read(file: &File) -> Result<Self, SnapshotError> {
        let mut info = FILE_ID_INFO::default();
        if unsafe {
            GetFileInformationByHandleEx(
                file.as_raw_handle().cast(),
                FileIdInfo,
                (&mut info as *mut FILE_ID_INFO).cast(),
                size_of::<FILE_ID_INFO>() as u32,
            )
        } == 0
        {
            return Err(SnapshotError::io(
                "inspect workspace identity",
                io::Error::last_os_error(),
            ));
        }
        Ok(Self {
            volume: info.VolumeSerialNumber,
            file: info.FileId.Identifier,
            path: handles::volume_path(file)
                .map_err(|error| SnapshotError::io("resolve workspace identity path", error))?,
        })
    }
}
