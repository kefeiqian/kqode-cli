use super::super::{
    attributes::Attributes,
    job::Job,
    native::{owned, verify_token, wide},
    pipes::Pipes,
    transport::{command_line, conventional_path, environment_block},
};
use super::{psec_api::Environment, support::TEST_TIMEOUT};
use crate::runtime::CommandContext;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{io, os::windows::io::AsRawHandle, ptr, time::Duration};
use windows_sys::Win32::{
    Foundation::WAIT_OBJECT_0,
    System::Threading::{
        CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessW,
        EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, PROCESS_INFORMATION, ResumeThread,
        STARTF_USESTDHANDLES, STARTUPINFOEXW, WaitForSingleObject,
    },
};

const JOIN_TIMEOUT_MS: u32 = 5_000;

pub(super) struct Output {
    pub code: u32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs fixed host probes only. A raw script is not an approved production transport.
pub(super) async fn run(
    context: &CommandContext,
    spec: &[u8],
    raw_script: Option<&str>,
    output_limit: usize,
) -> io::Result<Output> {
    let environment = Environment::create(spec)?;
    let pipes = Pipes::new().await?;
    let job = Job::new()?;
    let handles = pipes.handles();
    let job_handle = job.raw();
    let mut attributes =
        Attributes::new(None, &job_handle, &handles, None, Some(&environment.handle))?;
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[1];
    startup.StartupInfo.hStdError = handles[2];
    startup.lpAttributeList = attributes.raw();
    let executable = conventional_path(context.program())?;
    let cwd = conventional_path(context.cwd().as_os_str())?;
    let block = environment_block(context)?;
    let mut arguments = if let Some(script) = raw_script {
        let bytes: Vec<_> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let program =
            String::from_utf16(&executable[..executable.len() - 1]).map_err(io::Error::other)?;
        wide(format!(
            "\"{program}\" -NoLogo -NoProfile -NonInteractive -OutputFormat Text -EncodedCommand {}",
            STANDARD.encode(bytes)
        ))?
    } else {
        command_line(context)?
    };
    let mut information = PROCESS_INFORMATION::default();
    if unsafe {
        CreateProcessW(
            executable.as_ptr(),
            arguments.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            1,
            CREATE_SUSPENDED
                | CREATE_NO_WINDOW
                | CREATE_UNICODE_ENVIRONMENT
                | EXTENDED_STARTUPINFO_PRESENT,
            block.as_ptr().cast(),
            cwd.as_ptr(),
            &startup.StartupInfo,
            &mut information,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let process = unsafe { owned(information.hProcess)? };
    let thread = unsafe { owned(information.hThread)? };
    let started = verify_token(process.as_raw_handle().cast(), Some(true)).and_then(|_| {
        if unsafe { ResumeThread(thread.as_raw_handle().cast()) } == u32::MAX {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    });
    let readers = pipes.read(output_limit);
    let finished = if started.is_ok() {
        tokio::time::timeout(TEST_TIMEOUT, async {
            while unsafe { WaitForSingleObject(process.as_raw_handle().cast(), 0) } != WAIT_OBJECT_0
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .is_ok()
    } else {
        false
    };
    let stopped = job.stop();
    let joined = unsafe { WaitForSingleObject(process.as_raw_handle().cast(), JOIN_TIMEOUT_MS) };
    let output = readers.finish().await;
    stopped?;
    if joined != WAIT_OBJECT_0 {
        return Err(io::Error::other("PSEC probe root did not join"));
    }
    started?;
    if !finished {
        return Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "PSEC probe timed out",
        ));
    }
    let output = output.map_err(io::Error::other)?;
    if output.0.omitted_bytes != 0 || output.1.omitted_bytes != 0 {
        return Err(io::Error::other("PSEC probe output was truncated"));
    }
    let mut code = 0;
    if unsafe { GetExitCodeProcess(process.as_raw_handle().cast(), &mut code) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(Output {
        code,
        stdout: output.0.text,
        stderr: output.1.text,
    })
}
