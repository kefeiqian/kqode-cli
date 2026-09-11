use super::super::native::wide;
use std::{ffi::c_void, io, ptr};
use windows_sys::Win32::{
    Foundation::{FreeLibrary, HMODULE},
    System::{
        LibraryLoader::{GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW},
        Threading::{PROCESS_INFORMATION, STARTUPINFOW},
    },
};

// Experimental SBOX ABI published by Microsoft MXC; this module is test-only.
pub(super) type Create = unsafe extern "system" fn(
    *const u16,
    *mut u16,
    *const c_void,
    *const c_void,
    i32,
    u32,
    *const c_void,
    *const u16,
    *const STARTUPINFOW,
    *const u16,
    *const u8,
    u32,
    *mut PROCESS_INFORMATION,
) -> i32;
type Query = unsafe extern "system" fn(*mut u64) -> i32;

struct Library(HMODULE);
impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            FreeLibrary(self.0);
        }
    }
}

/// Keeps the system DLL loaded while the test invokes its experimental API.
pub(super) struct Api {
    _library: Library,
    pub create: Create,
    query: Query,
}

impl Api {
    /// Loads only the system DLL and requires the documented export names.
    pub fn load() -> io::Result<Self> {
        let library = Library(unsafe {
            LoadLibraryExW(
                wide("processmodel.dll")?.as_ptr(),
                ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_SYSTEM32,
            )
        });
        if library.0.is_null() {
            return Err(io::Error::last_os_error());
        }
        let query = unsafe {
            GetProcAddress(
                library.0,
                c"Experimental_QuerySandboxSupport".as_ptr().cast(),
            )
        }
        .ok_or_else(io::Error::last_os_error)?;
        let create = unsafe {
            GetProcAddress(
                library.0,
                c"Experimental_CreateProcessInSandbox".as_ptr().cast(),
            )
        }
        .ok_or_else(io::Error::last_os_error)?;
        Ok(Self {
            query: unsafe {
                std::mem::transmute::<unsafe extern "system" fn() -> isize, Query>(query)
            },
            create: unsafe {
                std::mem::transmute::<unsafe extern "system" fn() -> isize, Create>(create)
            },
            _library: library,
        })
    }

    /// Queries actual OS support rather than inferring it from export presence.
    pub fn capabilities(&self) -> io::Result<u64> {
        let mut capabilities = 0;
        if unsafe { (self.query)(&mut capabilities) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(capabilities)
    }
}
