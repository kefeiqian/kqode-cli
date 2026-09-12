use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr,
};

use windows_sys::Win32::{
    Foundation::{ERROR_INSUFFICIENT_BUFFER, LocalFree},
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            SDDL_REVISION_1,
        },
        GetTokenInformation, PSECURITY_DESCRIPTOR, TOKEN_QUERY, TOKEN_USER, TokenUser,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

/// Creates private, inheritable user/SYSTEM permissions before any source bytes are copied.
pub(crate) struct PrivateDescriptor(PSECURITY_DESCRIPTOR);

impl PrivateDescriptor {
    pub fn new() -> io::Result<Self> {
        Self::with_package(None)
    }

    pub fn with_package(package: Option<(&str, u32)>) -> io::Result<Self> {
        let user = current_user_sid()?;
        let package = package
            .map(|(sid, mask)| format!("(A;OICI;{mask:#x};;;{sid})"))
            .unwrap_or_default();
        Self::from_sddl(&format!("D:P(A;OICI;FA;;;{user})(A;OICI;FA;;;SY){package}"))
    }

    /// Creates a descriptor for newly owned probe objects, never existing host objects.
    #[cfg(test)]
    pub fn for_probe(principals: &[(&str, u32)], low_integrity: bool) -> io::Result<Self> {
        let user = current_user_sid()?;
        let grants = principals
            .iter()
            .map(|(sid, mask)| format!("(A;OICI;{mask:#x};;;{sid})"))
            .collect::<String>();
        let label = if low_integrity { "S:(ML;;NW;;;LW)" } else { "" };
        Self::from_sddl(&format!(
            "D:P(A;OICI;GA;;;{user})(A;OICI;GA;;;SY){grants}{label}"
        ))
    }

    fn from_sddl(sddl: &str) -> io::Result<Self> {
        let sddl: Vec<u16> = sddl.encode_utf16().chain([0]).collect();
        let mut descriptor = ptr::null_mut();
        if unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                ptr::null_mut(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(descriptor))
    }

    pub fn raw(&self) -> PSECURITY_DESCRIPTOR {
        self.0
    }
}

impl Drop for PrivateDescriptor {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}

fn current_user_sid() -> io::Result<String> {
    let mut token = ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let token = unsafe { OwnedHandle::from_raw_handle(token.cast()) };
    let mut bytes = 0;
    unsafe {
        GetTokenInformation(
            token.as_raw_handle().cast(),
            TokenUser,
            ptr::null_mut(),
            0,
            &mut bytes,
        );
    }
    if io::Error::last_os_error().raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER as i32)
        || bytes == 0
    {
        return Err(io::Error::last_os_error());
    }
    let mut buffer = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle().cast(),
            TokenUser,
            buffer.as_mut_ptr().cast(),
            bytes,
            &mut bytes,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
    unsafe { sid_to_string(user.User.Sid) }
}

/// Copies an OS-provided SID without exposing its backing native allocation.
///
/// # Safety
///
/// `sid` must point to a valid SID for the duration of this call.
pub(crate) unsafe fn sid_to_string(sid: windows_sys::Win32::Security::PSID) -> io::Result<String> {
    let mut text = ptr::null_mut();
    if unsafe { ConvertSidToStringSidW(sid, &mut text) } == 0 {
        return Err(io::Error::last_os_error());
    }
    unsafe {
        let mut length = 0;
        while *text.add(length) != 0 {
            length += 1;
        }
        let result =
            String::from_utf16(std::slice::from_raw_parts(text, length)).map_err(io::Error::other);
        LocalFree(text.cast());
        result
    }
}
