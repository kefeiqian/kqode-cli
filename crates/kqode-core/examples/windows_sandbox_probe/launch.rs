use std::{
    fs::File,
    io::{self, Read},
    os::windows::io::AsRawHandle,
    path::Path,
    ptr,
};

use kqode_core::runtime::CommandContext;
use serde::Serialize;
use windows_sys::Win32::{
    Foundation::{HANDLE_FLAG_INHERIT, SetHandleInformation, WAIT_OBJECT_0, WAIT_TIMEOUT},
    Security::SECURITY_CAPABILITIES,
    System::{
        Threading::{
            CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessW,
            EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, PROCESS_INFORMATION, ResumeThread,
            STARTF_USESTDHANDLES, STARTUPINFOEXW, WaitForSingleObject,
        },
        WindowsProgramming::PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT,
    },
};

use super::{
    attributes::Attributes,
    capabilities::Capabilities,
    identity::Identity,
    native::{Job, TokenObservation, owned, verify_token},
    transport::{command_line, conventional_path, environment_block},
};

const TIMEOUT_MS: u32 = 30_000;
const DRAIN_LIMIT: u64 = 32 * 1024;

#[derive(Serialize)]
pub(super) struct LaunchOutput {
    pub token: TokenObservation,
    pub exit_code: u32,
    pub timed_out: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Runs only the fixed probe script; capture files are not a general output limiter.
pub(super) fn launch(
    context: &CommandContext,
    identity: &Identity,
    isolation: Option<bool>,
    capability_names: &[&str],
    capture: &Path,
) -> io::Result<LaunchOutput> {
    let input = File::open(r"\\.\NUL")
        .map_err(|error| io::Error::other(format!("open null input: {error}")))?;
    let stdout_path = capture.join("stdout.txt");
    let stderr_path = capture.join("stderr.txt");
    let stdout = File::create(&stdout_path)?;
    let stderr = File::create(&stderr_path)?;
    let handles = [
        input.as_raw_handle().cast(),
        stdout.as_raw_handle().cast(),
        stderr.as_raw_handle().cast(),
    ];
    for handle in handles {
        if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } == 0 {
            return Err(io::Error::other(format!(
                "SetHandleInformation: {}",
                io::Error::last_os_error()
            )));
        }
    }
    let job = Job::new()?;
    let job_handle = job.raw();
    let mut capabilities = Capabilities::new(capability_names)?;
    let security = SECURITY_CAPABILITIES {
        AppContainerSid: identity.raw(),
        Capabilities: if capabilities.entries.is_empty() {
            ptr::null_mut()
        } else {
            capabilities.entries.as_mut_ptr()
        },
        CapabilityCount: capabilities.entries.len() as u32,
        ..Default::default()
    };
    let opt_out = PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT;
    let mut attributes = Attributes::new(
        isolation.map(|_| &security),
        &job_handle,
        &handles,
        (isolation == Some(true)).then_some(&opt_out),
    )?;
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[1];
    startup.StartupInfo.hStdError = handles[2];
    startup.lpAttributeList = attributes.raw();
    let executable = conventional_path(context.program())?;
    let cwd = conventional_path(context.cwd().as_os_str())?;
    let mut command = command_line(context)?;
    let environment = environment_block(context)?;
    let mut process = PROCESS_INFORMATION::default();
    if unsafe {
        CreateProcessW(
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
            &mut process,
        )
    } == 0
    {
        return Err(io::Error::other(format!(
            "CreateProcessW: {}",
            io::Error::last_os_error()
        )));
    }
    let process_handle = unsafe { owned(process.hProcess)? };
    let thread_handle = unsafe { owned(process.hThread)? };
    let token = verify_token(process_handle.as_raw_handle().cast(), isolation)
        .map_err(|error| io::Error::other(format!("verify child token: {error}")))?;
    if unsafe { ResumeThread(thread_handle.as_raw_handle().cast()) } == u32::MAX {
        return Err(io::Error::last_os_error());
    }
    let waited = unsafe { WaitForSingleObject(process_handle.as_raw_handle().cast(), TIMEOUT_MS) };
    let timed_out = waited == WAIT_TIMEOUT;
    if waited != WAIT_OBJECT_0 && !timed_out {
        return Err(io::Error::last_os_error());
    }
    job.terminate()?;
    if unsafe { WaitForSingleObject(process_handle.as_raw_handle().cast(), TIMEOUT_MS) }
        != WAIT_OBJECT_0
    {
        return Err(io::Error::other("probe process did not terminate"));
    }
    let mut exit_code = 0;
    if unsafe { GetExitCodeProcess(process_handle.as_raw_handle().cast(), &mut exit_code) } == 0 {
        return Err(io::Error::last_os_error());
    }
    drop(stdout);
    drop(stderr);
    Ok(LaunchOutput {
        token,
        exit_code,
        timed_out,
        stdout: capture_text(&stdout_path)?,
        stderr: capture_text(&stderr_path)?,
    })
}

fn capture_text(path: &Path) -> io::Result<String> {
    let file = File::open(path)?;
    if file.metadata()?.len() > DRAIN_LIMIT {
        return Err(io::Error::other("probe output exceeded capture limit"));
    }
    let mut bytes = Vec::new();
    file.take(DRAIN_LIMIT).read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
