use super::super::{SandboxAccountSetupError as Error, file_journal};
use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf, ptr};
use windows_sys::Win32::{
    System::Com::CoTaskMemFree,
    UI::Shell::{FOLDERID_LocalAppData, KF_FLAG_DONT_VERIFY, SHGetKnownFolderPath},
};

const MAX_PATH_UNITS: usize = 32768;
struct TaskString(*mut u16);
impl Drop for TaskString {
    fn drop(&mut self) {
        unsafe {
            CoTaskMemFree(self.0.cast());
        }
    }
}

/// Uses the current process user's registered known folder, never an environment fallback.
pub(super) fn local_app_data() -> Result<PathBuf, Error> {
    super::checked(
        "validate process identity",
        file_journal::require_process_identity(),
    )?;
    let mut output = TaskString(ptr::null_mut());
    let result = unsafe {
        SHGetKnownFolderPath(
            &FOLDERID_LocalAppData,
            KF_FLAG_DONT_VERIFY as u32,
            ptr::null_mut(),
            &mut output.0,
        )
    };
    if result < 0 {
        return Err(Error::Native {
            operation: "SHGetKnownFolderPath",
            code: result as u32,
        });
    }
    if output.0.is_null() {
        return Err(Error::InvalidNativeData("known-folder path"));
    }
    for length in 0..MAX_PATH_UNITS {
        if unsafe { *output.0.add(length) } == 0 {
            return Ok(PathBuf::from(OsString::from_wide(unsafe {
                std::slice::from_raw_parts(output.0, length)
            })));
        }
    }
    Err(Error::InvalidNativeData("known-folder path length"))
}
