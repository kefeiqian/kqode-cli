use std::{io, marker::PhantomData, mem::size_of, ptr};

use windows_sys::Win32::{
    Foundation::{ERROR_INSUFFICIENT_BUFFER, HANDLE},
    Security::SECURITY_CAPABILITIES,
    System::Threading::{
        DeleteProcThreadAttributeList, InitializeProcThreadAttributeList,
        LPPROC_THREAD_ATTRIBUTE_LIST, PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY,
        PROC_THREAD_ATTRIBUTE_HANDLE_LIST, PROC_THREAD_ATTRIBUTE_JOB_LIST,
        PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, UpdateProcThreadAttribute,
    },
};

/// Owns aligned attribute storage and borrows every value until after creation.
pub(super) struct Attributes<'a> {
    storage: Vec<usize>,
    values: PhantomData<&'a ()>,
}

impl<'a> Attributes<'a> {
    pub fn new(
        security: Option<&'a SECURITY_CAPABILITIES>,
        job: &'a HANDLE,
        handles: &'a [HANDLE; 3],
        lpac: Option<&'a u32>,
    ) -> io::Result<Self> {
        let count = 2 + u32::from(security.is_some()) + u32::from(lpac.is_some());
        let mut bytes = 0;
        unsafe {
            InitializeProcThreadAttributeList(ptr::null_mut(), count, 0, &mut bytes);
        }
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER as i32) || bytes == 0 {
            return Err(error);
        }
        let mut storage = vec![0usize; bytes.div_ceil(size_of::<usize>())];
        if unsafe {
            InitializeProcThreadAttributeList(storage.as_mut_ptr().cast(), count, 0, &mut bytes)
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let mut result = Self {
            storage,
            values: PhantomData,
        };
        if let Some(security) = security {
            result.set(PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, security)?;
        }
        result.set(PROC_THREAD_ATTRIBUTE_JOB_LIST, job)?;
        result.set(PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles)?;
        if let Some(policy) = lpac {
            result.set(
                PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY,
                policy,
            )?;
        }
        Ok(result)
    }

    fn set<T>(&mut self, key: u32, value: &'a T) -> io::Result<()> {
        let updated = unsafe {
            UpdateProcThreadAttribute(
                self.raw(),
                0,
                key as usize,
                ptr::from_ref(value).cast(),
                size_of::<T>(),
                ptr::null_mut(),
                ptr::null(),
            )
        };
        if updated == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    pub fn raw(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.storage.as_mut_ptr().cast()
    }
}

impl Drop for Attributes<'_> {
    fn drop(&mut self) {
        unsafe {
            DeleteProcThreadAttributeList(self.raw());
        }
    }
}
