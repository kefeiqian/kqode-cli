use super::super::SandboxAccountSetupError as Error;
use windows_sys::Win32::NetworkManagement::NetManagement::NetApiBufferFree;

const MAX_NATIVE_TEXT_UNITS: usize = 1024;

/// Owns buffers returned by NetAPI even on a failed native call.
#[derive(Default)]
pub(super) struct NetBuffer(pub *mut u8);

impl Drop for NetBuffer {
    fn drop(&mut self) {
        if !self.0.is_null() {
            let status = unsafe { NetApiBufferFree(self.0.cast()) };
            if status != 0 {
                eprintln!("sandbox account NetApiBufferFree failed ({status:#x})");
            }
        }
    }
}

pub(super) fn status(operation: &'static str, code: u32) -> Result<(), Error> {
    if code == 0 {
        Ok(())
    } else {
        Err(Error::Native { operation, code })
    }
}

pub(super) fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain([0]).collect()
}

/// Copies bounded native metadata, never password fields.
///
/// # Safety
///
/// `value` must be null or a valid, NUL-terminated NetAPI string.
pub(super) unsafe fn text(value: *const u16) -> Result<String, Error> {
    if value.is_null() {
        return Ok(String::new());
    }
    let mut length = 0;
    while length < MAX_NATIVE_TEXT_UNITS {
        if unsafe { *value.add(length) } == 0 {
            return String::from_utf16(unsafe { std::slice::from_raw_parts(value, length) })
                .map_err(|_| Error::InvalidNativeData("NetAPI text"));
        }
        length += 1;
    }
    Err(Error::InvalidNativeData("NetAPI text length"))
}
