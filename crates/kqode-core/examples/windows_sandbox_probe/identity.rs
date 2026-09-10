use std::{io, ptr};

use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{
        Authorization::ConvertSidToStringSidW,
        FreeSid,
        Isolation::{CreateAppContainerProfile, DeleteAppContainerProfile},
        PSID,
    },
};

use super::native::wide;

/// Owns a uniquely named, temporary profile. Never adopts a pre-existing profile.
pub(super) struct Identity {
    sid: PSID,
    name: Vec<u16>,
    registered: bool,
}

impl Identity {
    pub fn new() -> io::Result<Self> {
        let name = wide(format!("KQode.Probe.{}", uuid::Uuid::new_v4().simple()))?;
        let mut sid = ptr::null_mut();
        let status = unsafe {
            CreateAppContainerProfile(
                name.as_ptr(),
                name.as_ptr(),
                name.as_ptr(),
                ptr::null(),
                0,
                &mut sid,
            )
        };
        if status < 0 {
            return Err(io::Error::other(format!(
                "create temporary profile: HRESULT {status:#x}"
            )));
        }
        let identity = Self {
            sid,
            name,
            registered: true,
        };
        if identity.sid.is_null() {
            return Err(io::Error::other("profile creation returned null SID"));
        }
        Ok(identity)
    }

    pub fn raw(&self) -> PSID {
        self.sid
    }

    pub fn text(&self) -> io::Result<String> {
        let mut text = ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(self.sid, &mut text) } == 0 {
            return Err(io::Error::last_os_error());
        }
        // The API returns an allocated, NUL-terminated UTF-16 SID string.
        unsafe {
            let mut len = 0;
            while *text.add(len) != 0 {
                len += 1;
            }
            let result =
                String::from_utf16(std::slice::from_raw_parts(text, len)).map_err(io::Error::other);
            LocalFree(text.cast());
            result
        }
    }

    pub fn close(&mut self) -> io::Result<()> {
        if self.registered {
            let status = unsafe { DeleteAppContainerProfile(self.name.as_ptr()) };
            if status < 0 {
                return Err(io::Error::other(format!(
                    "delete temporary profile: HRESULT {status:#x}"
                )));
            }
            self.registered = false;
        }
        Ok(())
    }
}

impl Drop for Identity {
    fn drop(&mut self) {
        if let Err(error) = self.close() {
            eprintln!(
                "sandbox probe profile cleanup failed for {}: {error}",
                String::from_utf16_lossy(&self.name[..self.name.len() - 1])
            );
        }
        if !self.sid.is_null() {
            unsafe {
                FreeSid(self.sid);
            }
        }
    }
}
