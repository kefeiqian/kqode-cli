use super::{
    super::{
        SandboxAccountIdentity, SandboxAccountRole as Role, SandboxAccountSetupError as Error,
        WindowsSandboxAccountPlan, model::PrincipalFacts,
    },
    buffers::{NetBuffer, status, text, wide},
    sid,
};
use crate::runtime::windows_security::sid_to_string;
use secrecy::{ExposeSecret, SecretString};
use std::ptr;
use windows_sys::Win32::NetworkManagement::NetManagement::{
    LOCALGROUP_INFO_1, LOCALGROUP_MEMBERS_INFO_0, NERR_GroupNotFound, NERR_UserNotFound,
    NetLocalGroupAdd, NetLocalGroupAddMembers, NetLocalGroupGetInfo, NetUserAdd, NetUserGetInfo,
    UF_ACCOUNTDISABLE, UF_DONT_EXPIRE_PASSWD, UF_NORMAL_ACCOUNT, UF_SCRIPT, USER_INFO_1,
    USER_INFO_4, USER_PRIV_USER,
};
use zeroize::Zeroizing;

const DISABLED_USER_FLAGS: u32 =
    UF_SCRIPT | UF_NORMAL_ACCOUNT | UF_ACCOUNTDISABLE | UF_DONT_EXPIRE_PASSWD;

pub(super) fn inspect(
    plan: &WindowsSandboxAccountPlan,
    role: Role,
) -> Result<Option<PrincipalFacts>, Error> {
    let name = wide(plan.name(role));
    let mut buffer = NetBuffer::default();
    let code = if role == Role::Group {
        unsafe { NetLocalGroupGetInfo(ptr::null(), name.as_ptr(), 1, &mut buffer.0) }
    } else {
        unsafe { NetUserGetInfo(ptr::null(), name.as_ptr(), 4, &mut buffer.0) }
    };
    if code
        == if role == Role::Group {
            NERR_GroupNotFound
        } else {
            NERR_UserNotFound
        }
    {
        return Ok(None);
    }
    status("inspect local sandbox principal", code)?;
    if buffer.0.is_null() {
        return Err(Error::InvalidNativeData("NetAPI principal"));
    }
    let (name, marker, sid, disabled_normal_user) = if role == Role::Group {
        let info = unsafe { &*buffer.0.cast::<LOCALGROUP_INFO_1>() };
        (
            unsafe { text(info.lgrpi1_name)? },
            unsafe { text(info.lgrpi1_comment)? },
            sid::local_group(plan.name(role))?,
            false,
        )
    } else {
        let info = unsafe { &*buffer.0.cast::<USER_INFO_4>() };
        if info.usri4_user_sid.is_null() {
            return Err(Error::InvalidNativeData("sandbox user SID"));
        }
        let sid = unsafe { sid_to_string(info.usri4_user_sid) }
            .map_err(|_| Error::InvalidNativeData("sandbox user SID"))?;
        (
            unsafe { text(info.usri4_name)? },
            unsafe { text(info.usri4_comment)? },
            sid,
            info.usri4_priv == USER_PRIV_USER
                && info.usri4_flags & UF_ACCOUNTDISABLE != 0
                && info.usri4_flags & UF_NORMAL_ACCOUNT != 0,
        )
    };
    Ok(Some(PrincipalFacts {
        identity: SandboxAccountIdentity { role, name, sid },
        marker,
        disabled_normal_user,
    }))
}

/// Creates new local objects only; passwords never appear in arguments, logs or native errors.
pub(super) fn create(
    plan: &WindowsSandboxAccountPlan,
    role: Role,
    password: Option<&SecretString>,
) -> Result<(), Error> {
    let mut name = wide(plan.name(role));
    let mut marker = wide(plan.marker());
    if role == Role::Group {
        if password.is_some() {
            return Err(Error::InvalidPlan);
        }
        let info = LOCALGROUP_INFO_1 {
            lgrpi1_name: name.as_mut_ptr(),
            lgrpi1_comment: marker.as_mut_ptr(),
        };
        status("NetLocalGroupAdd", unsafe {
            NetLocalGroupAdd(
                ptr::null(),
                1,
                (&info as *const LOCALGROUP_INFO_1).cast(),
                ptr::null_mut(),
            )
        })
    } else {
        let password = password.ok_or(Error::InvalidPlan)?;
        let mut password = Zeroizing::new(
            password
                .expose_secret()
                .encode_utf16()
                .chain([0])
                .collect::<Vec<_>>(),
        );
        let info = USER_INFO_1 {
            usri1_name: name.as_mut_ptr(),
            usri1_password: password.as_mut_ptr(),
            usri1_priv: USER_PRIV_USER,
            usri1_comment: marker.as_mut_ptr(),
            usri1_flags: DISABLED_USER_FLAGS,
            ..Default::default()
        };
        status("NetUserAdd", unsafe {
            NetUserAdd(
                ptr::null(),
                1,
                (&info as *const USER_INFO_1).cast(),
                ptr::null_mut(),
            )
        })
    }
}

pub(super) fn add_member(
    group: &SandboxAccountIdentity,
    user: &SandboxAccountIdentity,
) -> Result<(), Error> {
    let sid = sid::OwnedSid::from_text(&user.sid)?;
    let member = LOCALGROUP_MEMBERS_INFO_0 { lgrmi0_sid: sid.0 };
    status("NetLocalGroupAddMembers", unsafe {
        NetLocalGroupAddMembers(
            ptr::null(),
            wide(&group.name).as_ptr(),
            0,
            (&member as *const LOCALGROUP_MEMBERS_INFO_0).cast(),
            1,
        )
    })
}
