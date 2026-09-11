use std::{
    fs::{File, Metadata},
    os::windows::fs::MetadataExt,
    path::Path,
};
use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

use super::{super::SnapshotError, directory};

/// Checks entry metadata and streams without following a path.
pub(super) fn inspect(file: &File, relative: &Path) -> Result<Metadata, SnapshotError> {
    let metadata = file
        .metadata()
        .map_err(|error| SnapshotError::io("inspect workspace entry", error))?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(unsupported(relative, "reparse points are not followed"));
    }
    if directory::has_named_stream(file, metadata.is_dir())
        .map_err(|error| SnapshotError::io("inspect workspace streams", error))?
    {
        return Err(unsupported(
            relative,
            "named data streams are not supported",
        ));
    }
    Ok(metadata)
}

pub(super) fn unchanged(before: &Metadata, after: &Metadata) -> bool {
    before.len() == after.len() && before.last_write_time() == after.last_write_time()
}

pub(super) fn unsupported(path: &Path, reason: &'static str) -> SnapshotError {
    SnapshotError::UnsupportedEntry {
        path: path.to_owned(),
        reason,
    }
}
