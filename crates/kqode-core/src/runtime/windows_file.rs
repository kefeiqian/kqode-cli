use crate::runtime::windows_security::PrivateDescriptor;
use std::{
    ffi::{OsStr, OsString},
    fs::File,
    io,
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        io::{AsRawHandle, FromRawHandle},
    },
    path::PathBuf,
    ptr,
};
use windows_sys::{
    Wdk::{
        Foundation::OBJECT_ATTRIBUTES,
        Storage::FileSystem::{
            FILE_CREATE, FILE_DIRECTORY_FILE, FILE_OPEN, FILE_OPEN_REPARSE_POINT,
            FILE_SYNCHRONOUS_IO_NONALERT, NtCreateFile,
        },
    },
    Win32::{
        Foundation::{
            OBJ_CASE_INSENSITIVE, OBJ_DONT_REPARSE, STATUS_OBJECT_NAME_NOT_FOUND,
            STATUS_OBJECT_PATH_NOT_FOUND, UNICODE_STRING,
        },
        Storage::FileSystem::{
            FILE_ATTRIBUTE_NORMAL, FILE_GENERIC_READ, FILE_GENERIC_WRITE,
            GetFinalPathNameByHandleW, VOLUME_NAME_GUID,
        },
        System::IO::IO_STATUS_BLOCK,
    },
};

/// Opens a single validated component, preserving missing-name errors for source checks.
pub(crate) fn open_child(
    parent: &File,
    name: &OsStr,
    create: Option<bool>,
    sharing: u32,
    security: Option<&PrivateDescriptor>,
    ignore_case: bool,
) -> io::Result<File> {
    let mut name: Vec<u16> = name.encode_wide().collect();
    if name.is_empty()
        || name
            .iter()
            .any(|unit| [0, b'\\' as u16, b'/' as u16, b':' as u16].contains(unit))
        || name == [b'.' as u16]
        || name == [b'.' as u16, b'.' as u16]
    {
        return Err(io::Error::other("invalid handle-relative filename"));
    }
    let length = u16::try_from(name.len() * size_of::<u16>()).map_err(io::Error::other)?;
    let mut unicode = UNICODE_STRING {
        Length: length,
        MaximumLength: length,
        Buffer: name.as_mut_ptr(),
    };
    let attributes = OBJECT_ATTRIBUTES {
        Length: size_of::<OBJECT_ATTRIBUTES>() as u32,
        RootDirectory: parent.as_raw_handle().cast(),
        ObjectName: &mut unicode,
        Attributes: OBJ_DONT_REPARSE | if ignore_case { OBJ_CASE_INSENSITIVE } else { 0 },
        SecurityDescriptor: security.map_or(ptr::null(), |descriptor| {
            descriptor.raw().cast_const().cast()
        }),
        ..Default::default()
    };
    let mut status = IO_STATUS_BLOCK::default();
    let mut handle = ptr::null_mut();
    let access = FILE_GENERIC_READ
        | if create.is_some() {
            FILE_GENERIC_WRITE
        } else {
            0
        };
    let options = FILE_OPEN_REPARSE_POINT
        | FILE_SYNCHRONOUS_IO_NONALERT
        | if create == Some(true) {
            FILE_DIRECTORY_FILE
        } else {
            0
        };
    let result = unsafe {
        NtCreateFile(
            &mut handle,
            access,
            &attributes,
            &mut status,
            ptr::null(),
            FILE_ATTRIBUTE_NORMAL,
            sharing,
            if create.is_some() {
                FILE_CREATE
            } else {
                FILE_OPEN
            },
            options,
            ptr::null(),
            0,
        )
    };
    if result < 0 {
        let kind = match result {
            STATUS_OBJECT_NAME_NOT_FOUND | STATUS_OBJECT_PATH_NOT_FOUND => io::ErrorKind::NotFound,
            _ => io::ErrorKind::Other,
        };
        return Err(io::Error::new(
            kind,
            format!("NtCreateFile failed: NTSTATUS {result:#x}"),
        ));
    }
    if handle.is_null() {
        return Err(io::Error::other("NtCreateFile returned a null handle"));
    }
    Ok(unsafe { File::from_raw_handle(handle.cast()) })
}

/// Resolves an already-open object, without reopening it by a mutable pathname.
pub(crate) fn final_path(file: &File) -> io::Result<PathBuf> {
    path_by_handle(file, 0)
}

/// Requires a volume-GUID path; remote shares without one fail closed.
pub(crate) fn volume_path(file: &File) -> io::Result<PathBuf> {
    path_by_handle(file, VOLUME_NAME_GUID)
}

fn path_by_handle(file: &File, flags: u32) -> io::Result<PathBuf> {
    let mut buffer = vec![0u16; 512];
    loop {
        let count = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle().cast(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                flags,
            )
        };
        if count == 0 {
            return Err(io::Error::last_os_error());
        }
        if (count as usize) < buffer.len() {
            return Ok(PathBuf::from(OsString::from_wide(
                &buffer[..count as usize],
            )));
        }
        buffer.resize(count as usize + 1, 0);
    }
}
