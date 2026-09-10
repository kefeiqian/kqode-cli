use std::io;

use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{DeriveCapabilitySidsFromName, PSID, SID_AND_ATTRIBUTES},
    System::SystemServices::SE_GROUP_ENABLED,
};

use super::native::wide;

#[derive(Default)]
struct SidArray {
    pointer: *mut PSID,
    count: u32,
}

impl Drop for SidArray {
    fn drop(&mut self) {
        if !self.pointer.is_null() {
            unsafe {
                for index in 0..self.count as usize {
                    LocalFree(*self.pointer.add(index));
                }
                LocalFree(self.pointer.cast());
            }
        }
    }
}

/// Owns capability SID allocations through native process creation.
pub(super) struct Capabilities {
    _sids: Vec<SidArray>,
    pub entries: Vec<SID_AND_ATTRIBUTES>,
}

impl Capabilities {
    pub fn new(names: &[&str]) -> io::Result<Self> {
        let mut result = Self {
            _sids: Vec::new(),
            entries: Vec::new(),
        };
        for name in names {
            let name = wide(name)?;
            let mut groups = SidArray::default();
            let mut capabilities = SidArray::default();
            if unsafe {
                DeriveCapabilitySidsFromName(
                    name.as_ptr(),
                    &mut groups.pointer,
                    &mut groups.count,
                    &mut capabilities.pointer,
                    &mut capabilities.count,
                )
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
            if capabilities.count != 1 || capabilities.pointer.is_null() {
                return Err(io::Error::other("unexpected derived capability SID count"));
            }
            result.entries.push(SID_AND_ATTRIBUTES {
                Sid: unsafe { *capabilities.pointer },
                Attributes: SE_GROUP_ENABLED as u32,
            });
            result._sids.push(capabilities);
        }
        Ok(result)
    }
}
