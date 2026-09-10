use std::{
    ffi::OsStr,
    io,
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    ptr,
};

use windows_sys::Win32::{
    Foundation::HANDLE,
    Security::{
        GetTokenInformation, TOKEN_INFORMATION_CLASS, TOKEN_QUERY, TokenIsAppContainer,
        TokenIsLessPrivilegedAppContainer,
    },
    System::{
        JobObjects::{
            CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject,
        },
        Threading::OpenProcessToken,
    },
};

pub(super) fn wide(value: impl AsRef<OsStr>) -> io::Result<Vec<u16>> {
    let mut units: Vec<u16> = value.as_ref().encode_wide().collect();
    if units.contains(&0) {
        return Err(io::Error::other("NUL in Win32 string"));
    }
    units.push(0);
    Ok(units)
}

/// Takes ownership of a successful Win32 handle result.
///
/// # Safety
///
/// `handle` must be null or a valid, uniquely owned, CloseHandle-compatible handle.
pub(super) unsafe fn owned(handle: HANDLE) -> io::Result<OwnedHandle> {
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(handle.cast()) })
}

pub(super) struct Job(OwnedHandle);
impl Job {
    pub fn new() -> io::Result<Self> {
        let handle = unsafe { owned(CreateJobObjectW(ptr::null(), ptr::null()))? };
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe {
            SetInformationJobObject(
                handle.as_raw_handle().cast(),
                JobObjectExtendedLimitInformation,
                ptr::from_ref(&limits).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(handle))
    }
    pub fn raw(&self) -> HANDLE {
        self.0.as_raw_handle().cast()
    }
    pub fn terminate(&self) -> io::Result<()> {
        if unsafe { TerminateJobObject(self.raw(), 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

#[derive(Default, serde::Serialize)]
pub(super) struct TokenObservation {
    appcontainer: bool,
    lpac: Option<bool>,
    lpac_query_error: Option<i32>,
}

pub(super) fn verify_token(
    process: HANDLE,
    isolation: Option<bool>,
) -> io::Result<TokenObservation> {
    let mut token = ptr::null_mut();
    if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let token = unsafe { owned(token)? };
    let appcontainer = token_flag(token.as_raw_handle().cast(), TokenIsAppContainer)?;
    if appcontainer != isolation.is_some() {
        return Err(io::Error::other(
            "created process token does not match isolation request",
        ));
    }
    let mut observation = TokenObservation {
        appcontainer,
        lpac: None,
        lpac_query_error: None,
    };
    if isolation.is_some() {
        match token_flag(
            token.as_raw_handle().cast(),
            TokenIsLessPrivilegedAppContainer,
        ) {
            Ok(lpac) if lpac == (isolation == Some(true)) => observation.lpac = Some(lpac),
            Ok(_) => return Err(io::Error::other("created token has unexpected LPAC state")),
            Err(error)
                if error.raw_os_error()
                    == Some(windows_sys::Win32::Foundation::ERROR_INVALID_PARAMETER as i32) =>
            {
                // This host cannot query this class; report the gap, not a false proof.
                observation.lpac_query_error = error.raw_os_error();
            }
            Err(error) => return Err(error),
        }
    }
    Ok(observation)
}

fn token_flag(token: HANDLE, class: TOKEN_INFORMATION_CLASS) -> io::Result<bool> {
    let mut value = 0u32;
    let mut length = 0;
    if unsafe {
        GetTokenInformation(
            token,
            class,
            ptr::from_mut(&mut value).cast(),
            4,
            &mut length,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if length != 4 {
        return Err(io::Error::other("unexpected token flag size"));
    }
    Ok(value != 0)
}
