use super::super::{
    attributes::Attributes,
    capabilities::Capabilities,
    identity::Identity,
    job::Job,
    native::owned,
    pipes::Pipes,
    transport::{command_line, conventional_path, environment_block},
};
use super::{private_desktop::Desktop, write_scope::Scope};
use crate::runtime::CommandContext;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{
    io,
    os::windows::io::{AsRawHandle, OwnedHandle},
    ptr,
};
use windows_sys::Win32::{
    Security::SECURITY_CAPABILITIES,
    System::{
        Threading::{
            CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessAsUserW,
            EXTENDED_STARTUPINFO_PRESENT, PROCESS_INFORMATION, STARTF_USESTDHANDLES,
            STARTUPINFOEXW,
        },
        WindowsProgramming::PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT,
    },
};

/// Fixed-probe launch only; the caller owns all resources through kill and join.
/// Raw commands exercise permitted cmdlets under constrained language, not the
/// production transport or approval contract. No execution-policy bypass is used.
pub(super) fn launch(
    context: &CommandContext,
    identity: &Identity,
    scope: &Scope,
    desktop: Option<&Desktop>,
    pipes: &Pipes,
    job: &Job,
    raw_probe: Option<&str>,
) -> io::Result<(OwnedHandle, OwnedHandle)> {
    let executable = conventional_path(context.program())?;
    let cwd = conventional_path(context.cwd().as_os_str())?;
    let mut command = if let Some(script) = raw_probe {
        let payload: Vec<_> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let program =
            String::from_utf16(&executable[..executable.len() - 1]).map_err(io::Error::other)?;
        super::super::native::wide(format!(
            "\"{program}\" -NoLogo -NoProfile -NonInteractive -EncodedCommand {}",
            STANDARD.encode(payload)
        ))?
    } else {
        command_line(context)?
    };
    let environment = environment_block(context)?;
    let handles = pipes.handles();
    let job_handle = job.raw();
    let mut capabilities = Capabilities::new(&["registryRead", "lpacInstrumentation"])?;
    let security = SECURITY_CAPABILITIES {
        AppContainerSid: identity.raw(),
        Capabilities: capabilities.entries.as_mut_ptr(),
        CapabilityCount: capabilities.entries.len() as u32,
        ..Default::default()
    };
    let policy = PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT;
    let mut attributes =
        Attributes::new(Some(&security), &job_handle, &handles, Some(&policy), None)?;
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[1];
    startup.StartupInfo.hStdError = handles[2];
    startup.StartupInfo.lpDesktop =
        desktop.map_or(ptr::null_mut(), |desktop| desktop.name.as_ptr().cast_mut());
    startup.lpAttributeList = attributes.raw();
    let mut info = PROCESS_INFORMATION::default();
    if unsafe {
        CreateProcessAsUserW(
            scope.token.as_raw_handle().cast(),
            executable.as_ptr(),
            command.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            1,
            EXTENDED_STARTUPINFO_PRESENT
                | CREATE_UNICODE_ENVIRONMENT
                | CREATE_NO_WINDOW
                | CREATE_SUSPENDED,
            environment.as_ptr().cast(),
            cwd.as_ptr(),
            &startup.StartupInfo,
            &mut info,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok((unsafe { owned(info.hProcess)? }, unsafe {
        owned(info.hThread)?
    }))
}
