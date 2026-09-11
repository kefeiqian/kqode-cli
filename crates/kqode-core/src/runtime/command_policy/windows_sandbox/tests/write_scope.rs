use super::super::native::{owned, wide};
use crate::runtime::windows_security::PrivateDescriptor;
use std::{
    fs::File,
    io,
    os::windows::io::{AsRawHandle, OwnedHandle},
    ptr,
};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{
        Authorization::{ConvertStringSidToSidW, SE_FILE_OBJECT, SetSecurityInfo},
        CreateRestrictedToken, DACL_SECURITY_INFORMATION, DISABLE_MAX_PRIVILEGE,
        GetSecurityDescriptorDacl, PROTECTED_DACL_SECURITY_INFORMATION, SID_AND_ATTRIBUTES,
        SetTokenInformation, TOKEN_ADJUST_DEFAULT, TOKEN_ASSIGN_PRIMARY, TOKEN_DEFAULT_DACL,
        TOKEN_DUPLICATE, TOKEN_QUERY, TokenDefaultDacl, WRITE_RESTRICTED,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

/// A fresh restricting SID with no corresponding account or host ACL grants.
pub(super) struct Scope {
    pub token: OwnedHandle,
    pub sid: String,
}

impl Scope {
    /// `include_world` is deliberately unsafe: it is only a compatibility
    /// counterexample, never an automatic fallback or an enforcing backend.
    pub fn new(include_world: bool) -> io::Result<Self> {
        let mut original = ptr::null_mut();
        if unsafe {
            OpenProcessToken(
                GetCurrentProcess(),
                TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ADJUST_DEFAULT,
                &mut original,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let original = unsafe { owned(original)? };
        let id = uuid::Uuid::new_v4().as_u128();
        let sid = format!(
            "S-1-5-21-{}-{}-{}-1001",
            id as u32,
            (id >> 32) as u32,
            (id >> 64) as u32
        );
        let text = wide(&sid)?;
        let mut raw = ptr::null_mut();
        if unsafe { ConvertStringSidToSidW(text.as_ptr(), &mut raw) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let entry = SID_AND_ATTRIBUTES {
            Sid: raw,
            Attributes: 0,
        };
        let mut world = ptr::null_mut();
        if include_world
            && unsafe {
                ConvertStringSidToSidW(super::super::native::wide("S-1-1-0")?.as_ptr(), &mut world)
            } == 0
        {
            let error = io::Error::last_os_error();
            unsafe {
                LocalFree(raw);
            }
            return Err(error);
        }
        let entries = [
            entry,
            SID_AND_ATTRIBUTES {
                Sid: world,
                Attributes: 0,
            },
        ];
        let mut token = ptr::null_mut();
        let result = unsafe {
            CreateRestrictedToken(
                original.as_raw_handle().cast(),
                DISABLE_MAX_PRIVILEGE | WRITE_RESTRICTED,
                0,
                ptr::null(),
                0,
                ptr::null(),
                if include_world { 2 } else { 1 },
                entries.as_ptr(),
                &mut token,
            )
        };
        let error = (result == 0).then(io::Error::last_os_error);
        unsafe {
            LocalFree(raw);
            if !world.is_null() {
                LocalFree(world);
            }
        }
        if let Some(error) = error {
            return Err(error);
        }
        let scope = Self {
            token: unsafe { owned(token)? },
            sid,
        };
        scope.set_defaults(&scope.token, None)?;
        Ok(scope)
    }

    fn set_defaults(&self, token: &OwnedHandle, package: Option<&str>) -> io::Result<()> {
        let mut principals = vec![(
            self.sid.as_str(),
            windows_sys::Win32::Foundation::GENERIC_ALL,
        )];
        if let Some(package) = package {
            principals.push((package, windows_sys::Win32::Foundation::GENERIC_ALL));
        }
        let descriptor = PrivateDescriptor::for_probe(&principals, false)?;
        let mut acl = ptr::null_mut();
        let mut present = 0;
        let mut defaulted = 0;
        if unsafe {
            GetSecurityDescriptorDacl(descriptor.raw(), &mut present, &mut acl, &mut defaulted)
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        if present == 0 || acl.is_null() {
            return Err(io::Error::other("missing token default DACL"));
        }
        let defaults = TOKEN_DEFAULT_DACL { DefaultDacl: acl };
        if unsafe {
            SetTokenInformation(
                token.as_raw_handle().cast(),
                TokenDefaultDacl,
                ptr::from_ref(&defaults).cast(),
                size_of::<TOKEN_DEFAULT_DACL>() as u32,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    pub fn set_child_defaults(&self, process: &OwnedHandle, package: &str) -> io::Result<()> {
        let mut token = ptr::null_mut();
        if unsafe {
            OpenProcessToken(
                process.as_raw_handle().cast(),
                TOKEN_ADJUST_DEFAULT,
                &mut token,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        self.set_defaults(&unsafe { owned(token)? }, Some(package))
    }

    /// Grants only pinned, freshly captured objects to both required SID checks.
    pub fn grant_copy(&self, files: &[File], package: &str, mask: u32) -> io::Result<()> {
        let descriptor =
            PrivateDescriptor::for_probe(&[(package, mask), (&self.sid, mask)], false)?;
        let mut dacl = ptr::null_mut();
        let mut present = 0;
        let mut defaulted = 0;
        if unsafe {
            GetSecurityDescriptorDacl(descriptor.raw(), &mut present, &mut dacl, &mut defaulted)
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        if present == 0 || dacl.is_null() {
            return Err(io::Error::other("missing probe DACL"));
        }
        for file in files {
            let result = unsafe {
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
            if result != 0 {
                return Err(io::Error::from_raw_os_error(result as i32));
            }
        }
        Ok(())
    }
}
