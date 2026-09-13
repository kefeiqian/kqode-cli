use super::super::{
    SandboxAccountRole, SandboxAccountSetupError as Error, WindowsSandboxAccountPlan,
    reconciliation::MAX_MEMBERS,
};
use super::buffers::{NetBuffer, status, wide};
use crate::runtime::windows_security::sid_to_string;
use std::ptr;
use windows_sys::Win32::NetworkManagement::NetManagement::{
    LOCALGROUP_MEMBERS_INFO_0, MAX_PREFERRED_LENGTH, NetLocalGroupGetMembers,
};

/// Requests a complete result instead of starting a resumable paged enumeration.
///
/// NetAPI controls allocation size. Only decoding/reporting is capped, not native
/// allocation or call latency. No account names are resolved from returned SIDs.
pub(super) fn read(plan: &WindowsSandboxAccountPlan) -> Result<Vec<String>, Error> {
    let mut buffer = NetBuffer::default();
    let mut read = 0;
    let mut total = 0;
    status("NetLocalGroupGetMembers", unsafe {
        NetLocalGroupGetMembers(
            ptr::null(),
            wide(plan.name(SandboxAccountRole::Group)).as_ptr(),
            0,
            &mut buffer.0,
            MAX_PREFERRED_LENGTH,
            &mut read,
            &mut total,
            ptr::null_mut(),
        )
    })?;
    if read as usize > MAX_MEMBERS || total as usize > MAX_MEMBERS {
        return Err(Error::ObservationLimit);
    }
    if read != total || (read != 0 && buffer.0.is_null()) {
        return Err(Error::InvalidNativeData("complete local group membership"));
    }
    let entries = if read == 0 {
        &[][..]
    } else {
        unsafe {
            std::slice::from_raw_parts(buffer.0.cast::<LOCALGROUP_MEMBERS_INFO_0>(), read as usize)
        }
    };
    unsafe { decode(entries) }
}

/// Copies SIDs before the native allocation is released.
///
/// # Safety
///
/// Each non-null SID pointer must remain valid for the duration of this call.
unsafe fn decode(entries: &[LOCALGROUP_MEMBERS_INFO_0]) -> Result<Vec<String>, Error> {
    entries
        .iter()
        .map(|member| {
            if member.lgrmi0_sid.is_null() {
                return Err(Error::InvalidNativeData("local group member SID"));
            }
            unsafe { sid_to_string(member.lgrmi0_sid) }
                .map_err(|_| Error::InvalidNativeData("local group member SID"))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::sid::OwnedSid;
    use super::*;

    #[test]
    fn native_member_sid_decoder_copies_values_and_rejects_null_sids() {
        let sid = OwnedSid::from_text("S-1-5-21-1-2-3-1000").unwrap();
        assert_eq!(
            unsafe { decode(&[LOCALGROUP_MEMBERS_INFO_0 { lgrmi0_sid: sid.0 }]) }.unwrap(),
            ["S-1-5-21-1-2-3-1000"]
        );
        assert!(
            unsafe {
                decode(&[LOCALGROUP_MEMBERS_INFO_0 {
                    lgrmi0_sid: ptr::null_mut(),
                }])
            }
            .is_err()
        );
        assert!(unsafe { decode(&[]) }.unwrap().is_empty());
    }
}
