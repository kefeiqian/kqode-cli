use std::{io, os::windows::ffi::OsStrExt, path::Path};
use windows_sys::Win32::Globalization::{CSTR_EQUAL, CompareStringOrdinal};

/// Compares resolved volume paths by components, conservatively ignoring case.
pub(super) fn overlaps(left: &Path, right: &Path) -> io::Result<bool> {
    for (left, right) in left.components().zip(right.components()) {
        let left: Vec<_> = left.as_os_str().encode_wide().collect();
        let right: Vec<_> = right.as_os_str().encode_wide().collect();
        let result = unsafe {
            CompareStringOrdinal(
                left.as_ptr(),
                i32::try_from(left.len()).map_err(io::Error::other)?,
                right.as_ptr(),
                i32::try_from(right.len()).map_err(io::Error::other)?,
                1,
            )
        };
        if result == 0 {
            return Err(io::Error::last_os_error());
        }
        if result != CSTR_EQUAL {
            return Ok(false);
        }
    }
    Ok(true)
}
