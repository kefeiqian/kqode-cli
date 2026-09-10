use std::{io, process::Stdio};

use tokio::process::{Child, Command};

pub(super) fn configure(command: &mut Command) {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_process_group(command);
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;

    command.process_group(0);
}

#[cfg(windows)]
fn configure_process_group(command: &mut Command) {
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP);
}

pub(super) struct ProcessTree {
    #[cfg(unix)]
    process_group_id: i32,
    #[cfg(windows)]
    job: std::os::windows::io::OwnedHandle,
}

impl ProcessTree {
    pub(super) fn attach(child: &Child) -> io::Result<Self> {
        attach(child)
    }

    pub(super) fn terminate(&self) -> io::Result<()> {
        terminate(self)
    }
}

impl Drop for ProcessTree {
    fn drop(&mut self) {
        let _ = terminate(self);
    }
}

#[cfg(unix)]
fn attach(child: &Child) -> io::Result<ProcessTree> {
    let process_group_id = i32::try_from(
        child
            .id()
            .ok_or_else(|| io::Error::other("child has no process id"))?,
    )
    .map_err(|_| io::Error::other("child process id exceeds i32"))?;
    Ok(ProcessTree { process_group_id })
}

#[cfg(unix)]
fn terminate(tree: &ProcessTree) -> io::Result<()> {
    let result = unsafe { libc::kill(-tree.process_group_id, libc::SIGKILL) };
    if result == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        Ok(())
    } else {
        Err(error)
    }
}

#[cfg(windows)]
fn attach(child: &Child) -> io::Result<ProcessTree> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle};

    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
                SetInformationJobObject,
            },
            Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
        },
    };

    let process_id = child
        .id()
        .ok_or_else(|| io::Error::other("child has no process id"))?;
    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return Err(io::Error::last_os_error());
    }
    let job = unsafe { std::os::windows::io::OwnedHandle::from_raw_handle(job.cast()) };
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job.as_raw_handle().cast(),
            JobObjectExtendedLimitInformation,
            std::ptr::from_ref(&limits).cast(),
            u32::try_from(std::mem::size_of_val(&limits)).unwrap_or(u32::MAX),
        )
    };
    if configured == 0 {
        return Err(io::Error::last_os_error());
    }
    let process = unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, process_id) };
    if process.is_null() {
        return Err(io::Error::last_os_error());
    }
    let assigned = unsafe { AssignProcessToJobObject(job.as_raw_handle().cast(), process) };
    unsafe {
        CloseHandle(process);
    }
    if assigned == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(ProcessTree { job })
}

#[cfg(windows)]
fn terminate(tree: &ProcessTree) -> io::Result<()> {
    use std::os::windows::io::AsRawHandle;

    use windows_sys::Win32::System::JobObjects::TerminateJobObject;

    if unsafe { TerminateJobObject(tree.job.as_raw_handle().cast(), 1) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
