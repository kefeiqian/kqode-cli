use super::{
    super::SandboxAccountSetupError as Error,
    buffers::{NetBuffer, status},
};
use std::{
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr,
};
use windows_sys::Win32::{
    NetworkManagement::NetManagement::{
        NetServerGetInfo, SERVER_INFO_101, SV_TYPE_DOMAIN_BAKCTRL, SV_TYPE_DOMAIN_CTRL,
    },
    Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation},
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

/// Requires elevation and refuses machines where a null-server SAM call is domain-wide.
pub(super) fn check() -> Result<(), Error> {
    let mut handle = ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut handle) } == 0 {
        return Err(Error::last_os("OpenProcessToken"));
    }
    if handle.is_null() {
        return Err(Error::InvalidNativeData("OpenProcessToken"));
    }
    let token = unsafe { OwnedHandle::from_raw_handle(handle.cast()) };
    let mut elevation = TOKEN_ELEVATION::default();
    let mut returned = 0;
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle().cast(),
            TokenElevation,
            (&mut elevation as *mut TOKEN_ELEVATION).cast(),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        )
    } == 0
    {
        return Err(Error::last_os("GetTokenInformation(TokenElevation)"));
    }
    if returned != size_of::<TOKEN_ELEVATION>() as u32 {
        return Err(Error::InvalidNativeData("TokenElevation length"));
    }
    if elevation.TokenIsElevated == 0 {
        return Err(Error::ElevationRequired);
    }
    let mut buffer = NetBuffer::default();
    status("NetServerGetInfo", unsafe {
        NetServerGetInfo(ptr::null(), 101, &mut buffer.0)
    })?;
    if buffer.0.is_null() {
        return Err(Error::InvalidNativeData("NetServerGetInfo"));
    }
    let server = unsafe { &*buffer.0.cast::<SERVER_INFO_101>() };
    if server.sv101_type & (SV_TYPE_DOMAIN_CTRL | SV_TYPE_DOMAIN_BAKCTRL) != 0 {
        return Err(Error::DomainControllerUnsupported);
    }
    Ok(())
}
