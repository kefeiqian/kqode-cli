use super::{super::SandboxAccountSetupError as Error, buffers::wide};
use crate::runtime::windows_security::sid_to_string;
use std::ptr;
use windows_sys::Win32::{
    Foundation::{ERROR_INSUFFICIENT_BUFFER, LocalFree},
    Security::{
        Authorization::ConvertStringSidToSidW, LookupAccountNameW, PSID, SID_NAME_USE, SidTypeAlias,
    },
    System::WindowsProgramming::GetComputerNameW,
};

const NAME_BUFFER_UNITS: usize = 256;
const MAX_SID_BYTES: u32 = 68;

/// Resolves a local alias using an OS-reported machine name, never a domain fallback.
pub(super) fn local_group(name: &str) -> Result<String, Error> {
    let mut computer = [0u16; NAME_BUFFER_UNITS];
    let mut length = computer.len() as u32;
    if unsafe { GetComputerNameW(computer.as_mut_ptr(), &mut length) } == 0 {
        return Err(Error::last_os("GetComputerNameW"));
    }
    if length as usize >= computer.len() {
        return Err(Error::InvalidNativeData("computer name length"));
    }
    let computer = String::from_utf16(&computer[..length as usize])
        .map_err(|_| Error::InvalidNativeData("computer name"))?;
    lookup(&format!("{computer}\\{name}"), Some(SidTypeAlias))
}

/// Resolves the fixed OS service principal; no caller-controlled identity is accepted.
pub(in super::super) fn trusted_installer() -> Result<String, Error> {
    lookup("NT SERVICE\\TrustedInstaller", None)
}

fn lookup(name: &str, expected_kind: Option<SID_NAME_USE>) -> Result<String, Error> {
    let name = wide(name);
    let mut sid_size = 0;
    let mut domain_size = 0;
    let mut kind = 0;
    if unsafe {
        LookupAccountNameW(
            ptr::null(),
            name.as_ptr(),
            ptr::null_mut(),
            &mut sid_size,
            ptr::null_mut(),
            &mut domain_size,
            &mut kind,
        )
    } != 0
    {
        return Err(Error::InvalidNativeData("LookupAccountNameW sizing"));
    }
    let error = unsafe { windows_sys::Win32::Foundation::GetLastError() };
    if error != ERROR_INSUFFICIENT_BUFFER {
        return Err(Error::Native {
            operation: "LookupAccountNameW",
            code: error,
        });
    }
    if sid_size == 0 || sid_size > MAX_SID_BYTES || domain_size as usize > NAME_BUFFER_UNITS {
        return Err(Error::InvalidNativeData("LookupAccountNameW lengths"));
    }
    let mut sid = vec![0u32; (sid_size as usize).div_ceil(size_of::<u32>())];
    let mut domain = vec![0u16; domain_size as usize];
    if unsafe {
        LookupAccountNameW(
            ptr::null(),
            name.as_ptr(),
            sid.as_mut_ptr().cast(),
            &mut sid_size,
            domain.as_mut_ptr(),
            &mut domain_size,
            &mut kind,
        )
    } == 0
    {
        return Err(Error::last_os("LookupAccountNameW"));
    }
    if expected_kind.is_some_and(|expected| kind != expected) {
        return Err(Error::InvalidNativeData("local group SID type"));
    }
    unsafe { sid_to_string(sid.as_mut_ptr().cast()) }
        .map_err(|_| Error::InvalidNativeData("local group SID"))
}

pub(super) struct OwnedSid(pub PSID);
impl OwnedSid {
    pub fn from_text(value: &str) -> Result<Self, Error> {
        let mut sid = ptr::null_mut();
        if unsafe { ConvertStringSidToSidW(wide(value).as_ptr(), &mut sid) } == 0 {
            return Err(Error::last_os("ConvertStringSidToSidW"));
        }
        if sid.is_null() {
            return Err(Error::InvalidNativeData("ConvertStringSidToSidW"));
        }
        Ok(Self(sid))
    }
}
impl Drop for OwnedSid {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}
