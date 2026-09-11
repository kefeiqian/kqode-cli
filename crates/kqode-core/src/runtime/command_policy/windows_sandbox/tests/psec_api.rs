use super::super::native::wide;
use std::{ffi::c_void, io, ptr};
use windows_sys::Win32::{
    Foundation::{FreeLibrary, HANDLE, HMODULE},
    System::LibraryLoader::{GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW},
};

type Query = unsafe extern "system" fn(*mut u64) -> i32;
type Create = unsafe extern "system" fn(*const c_void, u32, u32, *mut HANDLE) -> i32;
type Close = unsafe extern "system" fn(HANDLE);
struct Library(HMODULE);
impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            FreeLibrary(self.0);
        }
    }
}

/// Owns the test-only security environment and its DLL until teardown.
pub(super) struct Environment {
    _library: Library,
    pub handle: HANDLE,
    close: Close,
}
impl Drop for Environment {
    fn drop(&mut self) {
        unsafe {
            (self.close)(self.handle);
        }
    }
}

impl Environment {
    /// Creates a PSEC environment only when the live support query accepts denials.
    pub fn create(spec: &[u8]) -> io::Result<Self> {
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
        let query: Query = unsafe {
            std::mem::transmute::<unsafe extern "system" fn() -> isize, Query>(
                GetProcAddress(
                    library.0,
                    c"QueryProcessSecurityEnvironmentSupport".as_ptr().cast(),
                )
                .ok_or_else(io::Error::last_os_error)?,
            )
        };
        let create: Create = unsafe {
            std::mem::transmute::<unsafe extern "system" fn() -> isize, Create>(
                GetProcAddress(
                    library.0,
                    c"CreateProcessSecurityEnvironment".as_ptr().cast(),
                )
                .ok_or_else(io::Error::last_os_error)?,
            )
        };
        let close: Close = unsafe {
            std::mem::transmute::<unsafe extern "system" fn() -> isize, Close>(
                GetProcAddress(
                    library.0,
                    c"CloseProcessSecurityEnvironment".as_ptr().cast(),
                )
                .ok_or_else(io::Error::last_os_error)?,
            )
        };
        let mut support = 0;
        let status = unsafe { query(&mut support) };
        if status < 0 {
            return Err(io::Error::other(format!("PSEC query HRESULT {status:#x}")));
        }
        if support & 1 == 0 {
            return Err(io::Error::other("PSEC fs-deny support unavailable"));
        }
        let mut handle = ptr::null_mut();
        let status = unsafe { create(spec.as_ptr().cast(), spec.len() as u32, 0, &mut handle) };
        if status < 0 {
            return Err(io::Error::other(format!("PSEC create HRESULT {status:#x}")));
        }
        if handle.is_null() {
            return Err(io::Error::other("PSEC create returned a null handle"));
        }
        Ok(Self {
            _library: library,
            handle,
            close,
        })
    }
}
