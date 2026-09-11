use super::{
    super::{CommandContext, CommandGateError},
    attributes::Attributes,
    capabilities::Capabilities,
    identity::Identity,
    native::{Job, TokenObservation, owned, verify_token},
    pipes::Pipes,
    transport::{command_line, conventional_path, environment_block},
};
use crate::cancellation::CancellationToken;
use std::{
    io,
    os::windows::io::{AsRawHandle, OwnedHandle},
    ptr,
};
use windows_sys::Win32::{
    Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT},
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

pub(super) struct NativeProcess {
    job: Job,
    process: OwnedHandle,
    identity: Identity,
    pub token: TokenObservation,
    closed: bool,
}

const PROCESS_JOIN_TIMEOUT_MS: u32 = 5_000;

#[cfg(test)]
#[path = "tests/admission.rs"]
mod tests;

impl NativeProcess {
    pub fn spawn(
        context: &CommandContext,
        identity: Identity,
        pipes: &Pipes,
        cancel: &CancellationToken,
    ) -> Result<Self, CommandGateError> {
        let create = || -> io::Result<(Job, OwnedHandle, OwnedHandle)> {
            let executable = conventional_path(context.program())?;
            let cwd = conventional_path(context.cwd().as_os_str())?;
            let mut command = command_line(context)?;
            let environment = environment_block(context)?;
            let job = Job::new()?;
            let job_handle = job.raw();
            let handles = pipes.handles();
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
            startup.lpAttributeList = attributes.raw();
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
                return Err(io::Error::last_os_error());
            }
            Ok((job, unsafe { owned(process.hProcess)? }, unsafe {
                owned(process.hThread)?
            }))
        };
        let (job, process, thread) =
            create().map_err(|source| CommandGateError::NativeSandbox {
                operation: "create LPAC process",
                source,
            })?;
        let mut child = Self {
            job,
            process,
            identity,
            token: TokenObservation::default(),
            closed: false,
        };
        child.token =
            verify_token(child.process.as_raw_handle().cast(), Some(true)).map_err(|source| {
                CommandGateError::NativeSandbox {
                    operation: "verify LPAC token",
                    source,
                }
            })?;
        if cancel.is_cancelled() {
            return Err(CommandGateError::Cancelled);
        }
        if unsafe { ResumeThread(thread.as_raw_handle().cast()) } == u32::MAX {
            return Err(CommandGateError::NativeSandbox {
                operation: "resume LPAC process",
                source: io::Error::last_os_error(),
            });
        }
        Ok(child)
    }

    pub fn poll(&self) -> io::Result<Option<i32>> {
        match unsafe { WaitForSingleObject(self.process.as_raw_handle().cast(), 0) } {
            WAIT_TIMEOUT => Ok(None),
            WAIT_OBJECT_0 => {
                let mut code = 0;
                if unsafe { GetExitCodeProcess(self.process.as_raw_handle().cast(), &mut code) }
                    == 0
                {
                    return Err(io::Error::last_os_error());
                }
                Ok(Some(code as i32))
            }
            _ => Err(io::Error::last_os_error()),
        }
    }

    pub fn close(&mut self) -> io::Result<()> {
        if !self.closed {
            self.job.stop()?;
            // A zero job count can precede the root process handle becoming signaled.
            if unsafe {
                WaitForSingleObject(self.process.as_raw_handle().cast(), PROCESS_JOIN_TIMEOUT_MS)
            } != WAIT_OBJECT_0
            {
                return Err(io::Error::other(
                    "LPAC root process termination deadline exceeded",
                ));
            }
            self.identity.close()?;
            self.closed = true;
        }
        Ok(())
    }
}

impl Drop for NativeProcess {
    fn drop(&mut self) {
        if let Err(error) = self.close() {
            eprintln!("LPAC process cleanup failed: {error}");
        }
    }
}
