use super::super::native::{owned, wide};
use std::{
    io,
    os::windows::io::{AsRawHandle, OwnedHandle},
    ptr,
};
use windows_sys::Win32::{
    Foundation::{ERROR_INSUFFICIENT_BUFFER, LocalFree},
    Security::{
        Authorization::ConvertStringSidToSidW, EqualSid, GetTokenInformation, SID_AND_ATTRIBUTES,
        TOKEN_GROUPS, TOKEN_QUERY, TokenRestrictedSids,
    },
    System::Threading::OpenProcessToken,
};

/// Verifies that lowbox creation retained the fresh restricting SID, without logging identities.
pub(super) fn contains_scope(process: &OwnedHandle, scope: &str) -> io::Result<bool> {
    let mut token = ptr::null_mut();
    if unsafe { OpenProcessToken(process.as_raw_handle().cast(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let token = unsafe { owned(token)? };
    let mut bytes = 0;
    unsafe {
        GetTokenInformation(
            token.as_raw_handle().cast(),
            TokenRestrictedSids,
            ptr::null_mut(),
            0,
            &mut bytes,
        );
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER as i32) || bytes == 0 {
        return Err(error);
    }
    let mut buffer = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle().cast(),
            TokenRestrictedSids,
            buffer.as_mut_ptr().cast(),
            bytes,
            &mut bytes,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let groups = buffer.as_ptr().cast::<TOKEN_GROUPS>();
    let count = unsafe { (*groups).GroupCount } as usize;
    let offset = std::mem::offset_of!(TOKEN_GROUPS, Groups);
    if offset + count * size_of::<SID_AND_ATTRIBUTES>() > bytes as usize {
        return Err(io::Error::other("invalid restricted SID buffer"));
    }
    let entries = unsafe {
        std::slice::from_raw_parts(
            ptr::addr_of!((*groups).Groups).cast::<SID_AND_ATTRIBUTES>(),
            count,
        )
    };
    let text = wide(scope)?;
    let mut expected = ptr::null_mut();
    if unsafe { ConvertStringSidToSidW(text.as_ptr(), &mut expected) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let present = entries
        .iter()
        .any(|entry| unsafe { EqualSid(entry.Sid, expected) } != 0);
    unsafe {
        LocalFree(expected);
    }
    Ok(present)
}
