use super::native::owned;
use std::{
    io,
    os::windows::io::{AsRawHandle, OwnedHandle},
    ptr,
    time::Instant,
};
use windows_sys::Win32::{
    Foundation::{ERROR_INVALID_PARAMETER, ERROR_MORE_DATA, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::{
        JobObjects::{
            IsProcessInJob, JOBOBJECT_BASIC_PROCESS_ID_LIST, JobObjectBasicProcessIdList,
            QueryInformationJobObject,
        },
        Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
            WaitForSingleObject,
        },
    },
};

const INITIAL_PROCESS_CAPACITY: usize = 64;
const MAX_PROCESS_CAPACITY: usize = 4096;
const HEADER_WORDS: usize =
    std::mem::offset_of!(JOBOBJECT_BASIC_PROCESS_ID_LIST, ProcessIdList) / size_of::<usize>();

/// Pins current members before termination; job accounting alone is not a join.
pub(super) fn pin(job: HANDLE) -> io::Result<Vec<OwnedHandle>> {
    let mut capacity = INITIAL_PROCESS_CAPACITY;
    let ids = loop {
        let mut buffer = vec![0usize; HEADER_WORDS + capacity];
        let success = unsafe {
            QueryInformationJobObject(
                job,
                JobObjectBasicProcessIdList,
                buffer.as_mut_ptr().cast(),
                size_of_val(buffer.as_slice()) as u32,
                ptr::null_mut(),
            )
        };
        if success == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(ERROR_MORE_DATA as i32) {
                return Err(error);
            }
        }
        let header = unsafe { &*buffer.as_ptr().cast::<JOBOBJECT_BASIC_PROCESS_ID_LIST>() };
        let count = header.NumberOfProcessIdsInList as usize;
        if success != 0 && count == header.NumberOfAssignedProcesses as usize && count <= capacity {
            break buffer[HEADER_WORDS..HEADER_WORDS + count].to_vec();
        }
        if capacity >= MAX_PROCESS_CAPACITY {
            return Err(io::Error::other(
                "LPAC descendant enumeration limit exceeded",
            ));
        }
        capacity *= 2;
    };
    let mut handles = Vec::with_capacity(ids.len());
    for pid in ids {
        let handle = unsafe {
            OpenProcess(
                PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
                0,
                pid as u32,
            )
        };
        if handle.is_null() {
            let error = io::Error::last_os_error();
            // A process can finish and lose its last handle between enumeration and opening.
            if error.raw_os_error() == Some(ERROR_INVALID_PARAMETER as i32) {
                continue;
            }
            return Err(error);
        }
        let handle = unsafe { owned(handle)? };
        let mut member = 0;
        if unsafe { IsProcessInJob(handle.as_raw_handle().cast(), job, &mut member) } == 0 {
            return Err(io::Error::last_os_error());
        }
        // Do not wait on an unrelated process if Windows has already reused the PID.
        if member != 0 {
            handles.push(handle);
        }
    }
    Ok(handles)
}

/// Waits for actual process handles within the shared cleanup deadline.
pub(super) fn join(handles: &[OwnedHandle], deadline: Instant) -> io::Result<()> {
    for handle in handles {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match unsafe {
            WaitForSingleObject(
                handle.as_raw_handle().cast(),
                remaining.as_millis().min(u128::from(u32::MAX - 1)) as u32,
            )
        } {
            WAIT_OBJECT_0 => {}
            WAIT_TIMEOUT => return Err(io::Error::other("LPAC descendant join deadline exceeded")),
            _ => return Err(io::Error::last_os_error()),
        }
    }
    Ok(())
}
