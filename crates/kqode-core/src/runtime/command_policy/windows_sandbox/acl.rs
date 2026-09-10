use crate::runtime::windows_security::PrivateDescriptor;
use std::{fs::File, io, os::windows::io::AsRawHandle, ptr};
use windows_sys::Win32::Security::{
    Authorization::{SE_FILE_OBJECT, SetSecurityInfo},
    DACL_SECURITY_INFORMATION, GetSecurityDescriptorDacl, PROTECTED_DACL_SECURITY_INFORMATION,
};

/// Only already validated, pinned private-copy objects are passed here.
pub(super) fn grant(files: &[File], sid: &str, mask: u32) -> io::Result<()> {
    let descriptor = PrivateDescriptor::with_package(Some((sid, mask)))?;
    let mut present = 0;
    let mut defaulted = 0;
    let mut dacl = ptr::null_mut();
    if unsafe {
        GetSecurityDescriptorDacl(descriptor.raw(), &mut present, &mut dacl, &mut defaulted)
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if present == 0 || dacl.is_null() {
        return Err(io::Error::other("missing private-copy DACL"));
    }
    for file in files {
        let error = unsafe {
            SetSecurityInfo(
                file.as_raw_handle().cast(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                ptr::null_mut(),
                ptr::null_mut(),
                dacl,
                ptr::null(),
            )
        };
        if error != 0 {
            return Err(io::Error::from_raw_os_error(error as i32));
        }
    }
    Ok(())
}
