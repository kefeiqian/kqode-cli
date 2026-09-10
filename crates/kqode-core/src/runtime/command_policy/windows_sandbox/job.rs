use super::{descendants, native::owned};
use std::{
    cell::Cell,
    io,
    os::windows::io::{AsRawHandle, OwnedHandle},
    ptr, thread,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::HANDLE,
    System::JobObjects::{
        CreateJobObjectW, JOB_OBJECT_LIMIT_ACTIVE_PROCESS, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JobObjectBasicAccountingInformation, JobObjectExtendedLimitInformation,
        QueryInformationJobObject, SetInformationJobObject, TerminateJobObject,
    },
};

const TERMINATION_TIMEOUT: Duration = Duration::from_secs(5);
const TERMINATION_POLL: Duration = Duration::from_millis(5);
const SHUTDOWN_PROCESS_LIMIT: u32 = 1;

pub(super) struct Job {
    handle: OwnedHandle,
    stopped: Cell<bool>,
}
impl Job {
    pub fn new() -> io::Result<Self> {
        let handle = unsafe { owned(CreateJobObjectW(ptr::null(), ptr::null()))? };
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe {
            SetInformationJobObject(
                handle.as_raw_handle().cast(),
                JobObjectExtendedLimitInformation,
                ptr::from_ref(&limits).cast(),
                size_of_val(&limits) as u32,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self {
            handle,
            stopped: Cell::new(false),
        })
    }
    pub fn raw(&self) -> HANDLE {
        self.handle.as_raw_handle().cast()
    }
    pub fn terminate(&self) -> io::Result<()> {
        if unsafe { TerminateJobObject(self.raw(), 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    /// Prevents existing members from admitting another process during shutdown.
    ///
    /// A creator itself consumes the one remaining slot. With no active members,
    /// there is no in-job creator; this private Job is never assigned new host work.
    pub fn close_admission(&self) -> io::Result<()> {
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        if unsafe {
            QueryInformationJobObject(
                self.raw(),
                JobObjectExtendedLimitInformation,
                ptr::from_mut(&mut limits).cast(),
                size_of_val(&limits) as u32,
                ptr::null_mut(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        limits.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
        limits.BasicLimitInformation.ActiveProcessLimit = SHUTDOWN_PROCESS_LIMIT;
        if unsafe {
            SetInformationJobObject(
                self.raw(),
                JobObjectExtendedLimitInformation,
                ptr::from_ref(&limits).cast(),
                size_of_val(&limits) as u32,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    pub fn stop(&self) -> io::Result<()> {
        if self.stopped.get() {
            return Ok(());
        }
        let deadline = Instant::now() + TERMINATION_TIMEOUT;
        let handles = self
            .close_admission()
            .and_then(|()| descendants::pin(self.raw()));
        // Always terminate, even when fencing or collecting wait handles failed.
        self.terminate()?;
        let handles = handles?;
        loop {
            let mut info = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            if unsafe {
                QueryInformationJobObject(
                    self.raw(),
                    JobObjectBasicAccountingInformation,
                    ptr::from_mut(&mut info).cast(),
                    size_of_val(&info) as u32,
                    ptr::null_mut(),
                )
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
            if info.ActiveProcesses == 0 {
                descendants::join(&handles, deadline)?;
                self.stopped.set(true);
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(io::Error::other(
                    "LPAC descendant termination deadline exceeded",
                ));
            }
            thread::sleep(TERMINATION_POLL);
        }
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("LPAC job cleanup failed: {error}");
        }
    }
}
