use super::invalid;
use crate::runtime::windows_security::{current_user_sid, sid_to_string};
use std::{fs::File, io, os::windows::io::AsRawHandle, ptr};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{
        ACCESS_ALLOWED_ACE,
        Authorization::{GetSecurityInfo, SE_FILE_OBJECT},
        CONTAINER_INHERIT_ACE, DACL_SECURITY_INFORMATION, GetAce, GetSecurityDescriptorControl,
        IsValidAcl, IsValidSecurityDescriptor, OBJECT_INHERIT_ACE, OWNER_SECURITY_INFORMATION,
        PSECURITY_DESCRIPTOR, SE_DACL_PROTECTED,
    },
    Storage::FileSystem::FILE_ALL_ACCESS,
    System::SystemServices::ACCESS_ALLOWED_ACE_TYPE,
};

const SYSTEM_SID: &str = "S-1-5-18";
const ADMINISTRATORS_SID: &str = "S-1-5-32-544";
const SID_HEADER_BYTES: usize = 8;
const SID_REVISION: u8 = 1;
const MAX_SID_SUBAUTHORITIES: u8 = 15;

struct Descriptor(PSECURITY_DESCRIPTOR);
impl Drop for Descriptor {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                LocalFree(self.0);
            }
        }
    }
}

/// Accepts only the writer's protected user/SYSTEM DACL and a trusted owner.
pub(super) fn verify(file: &File) -> io::Result<()> {
    let mut descriptor = Descriptor(ptr::null_mut());
    let mut owner = ptr::null_mut();
    let mut acl = ptr::null_mut();
    let code = unsafe {
        GetSecurityInfo(
            file.as_raw_handle().cast(),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &mut owner,
            ptr::null_mut(),
            &mut acl,
            ptr::null_mut(),
            &mut descriptor.0,
        )
    };
    if code != 0 {
        return Err(io::Error::from_raw_os_error(code as i32));
    }
    if descriptor.0.is_null() || owner.is_null() || acl.is_null() {
        return Err(invalid("journal security descriptor is incomplete"));
    }
    if unsafe { IsValidSecurityDescriptor(descriptor.0) } == 0 || unsafe { IsValidAcl(acl) } == 0 {
        return Err(invalid("journal security descriptor is invalid"));
    }
    let user = current_user_sid()?;
    let owner = unsafe { sid_to_string(owner) }?;
    // An elevated token may default new object ownership to Administrators.
    if ![user.as_str(), SYSTEM_SID, ADMINISTRATORS_SID].contains(&owner.as_str()) {
        return Err(invalid("journal object owner is not trusted"));
    }
    let mut control = 0;
    let mut revision = 0;
    if unsafe { GetSecurityDescriptorControl(descriptor.0, &mut control, &mut revision) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if control & SE_DACL_PROTECTED == 0 || unsafe { (*acl).AceCount } != 2 {
        return Err(invalid("journal DACL must remain protected and private"));
    }
    let mut observed = Vec::new();
    for index in 0..2 {
        let mut raw = ptr::null_mut();
        if unsafe { GetAce(acl, index, &mut raw) } == 0 {
            return Err(io::Error::last_os_error());
        }
        if raw.is_null() {
            return Err(invalid("journal DACL contains an invalid ACE"));
        }
        let header = unsafe { &*raw.cast::<windows_sys::Win32::Security::ACE_HEADER>() };
        if u32::from(header.AceType) != ACCESS_ALLOWED_ACE_TYPE
            || usize::from(header.AceSize) < size_of::<ACCESS_ALLOWED_ACE>()
            || u32::from(header.AceFlags) & !(OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE) != 0
        {
            return Err(invalid("journal DACL contains unexpected ACE semantics"));
        }
        let ace = unsafe { &*raw.cast::<ACCESS_ALLOWED_ACE>() };
        if ace.Mask != FILE_ALL_ACCESS {
            return Err(invalid("journal DACL has unexpected access rights"));
        }
        let sid_offset = std::mem::offset_of!(ACCESS_ALLOWED_ACE, SidStart);
        let sid_bytes = usize::from(header.AceSize) - sid_offset;
        if sid_bytes < SID_HEADER_BYTES {
            return Err(invalid("journal ACE SID is truncated"));
        }
        let bytes =
            unsafe { std::slice::from_raw_parts(raw.cast::<u8>().add(sid_offset), sid_bytes) };
        if bytes[0] != SID_REVISION
            || bytes[1] > MAX_SID_SUBAUTHORITIES
            || sid_bytes != SID_HEADER_BYTES + usize::from(bytes[1]) * size_of::<u32>()
        {
            return Err(invalid("journal ACE SID length is invalid"));
        }
        observed.push(unsafe { sid_to_string((&ace.SidStart as *const u32).cast_mut().cast()) }?);
    }
    observed.sort();
    let mut expected = vec![user, SYSTEM_SID.to_owned()];
    expected.sort();
    if observed != expected {
        return Err(invalid("journal DACL grants unexpected principals"));
    }
    Ok(())
}
