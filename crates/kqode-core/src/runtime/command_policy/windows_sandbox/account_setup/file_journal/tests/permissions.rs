use super::super::{super::SandboxAccountJournal, PrivateSandboxAccountJournal};
use super::support::*;
use crate::runtime::windows_security::{current_user_sid, sid_to_string};
use std::{ffi::c_void, fs, os::windows::ffi::OsStrExt, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{
        ACCESS_ALLOWED_ACE, ACL,
        Authorization::{GetNamedSecurityInfoW, SE_FILE_OBJECT},
        DACL_SECURITY_INFORMATION, GetAce, GetSecurityDescriptorControl, PSECURITY_DESCRIPTOR,
        SE_DACL_PROTECTED,
    },
    Storage::FileSystem::FILE_ALL_ACCESS,
    System::SystemServices::ACCESS_ALLOWED_ACE_TYPE,
};

fn assert_private(path: &Path) {
    let path: Vec<_> = path.as_os_str().encode_wide().chain([0]).collect();
    let mut descriptor: PSECURITY_DESCRIPTOR = ptr::null_mut();
    let mut acl: *mut ACL = ptr::null_mut();
    let status = unsafe {
        GetNamedSecurityInfoW(
            path.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut acl,
            ptr::null_mut(),
            &mut descriptor,
        )
    };
    assert_eq!(status, 0);
    let mut control = 0;
    let mut revision = 0;
    assert_ne!(
        unsafe { GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) },
        0
    );
    assert_ne!(control & SE_DACL_PROTECTED, 0);
    assert!(!acl.is_null());
    assert_eq!(unsafe { (*acl).AceCount }, 2);
    let mut sids = Vec::new();
    for index in 0..2 {
        let mut ace: *mut c_void = ptr::null_mut();
        assert_ne!(unsafe { GetAce(acl, index, &mut ace) }, 0);
        let ace = unsafe { &*ace.cast::<ACCESS_ALLOWED_ACE>() };
        assert_eq!(u32::from(ace.Header.AceType), ACCESS_ALLOWED_ACE_TYPE);
        assert_eq!(ace.Mask, FILE_ALL_ACCESS);
        sids.push(
            unsafe { sid_to_string((&ace.SidStart as *const u32).cast_mut().cast()) }.unwrap(),
        );
    }
    unsafe {
        LocalFree(descriptor);
    }
    sids.sort();
    let mut expected = vec![current_user_sid().unwrap(), "S-1-5-18".into()];
    expected.sort();
    assert_eq!(sids, expected);
}

#[test]
fn directory_and_file_have_protected_user_system_only_dacls() {
    let fixture = Fixture::new();
    let (plan, passwords) = credentials();
    let mut journal = PrivateSandboxAccountJournal::new(fixture.parent()).unwrap();
    journal.begin(&plan, &passwords).unwrap();
    drop(journal);
    assert_private(&fixture.directory(&plan));
    assert_private(&fixture.journal(&plan));
    assert_eq!(fs::read_dir(fixture.directory(&plan)).unwrap().count(), 1);
}
