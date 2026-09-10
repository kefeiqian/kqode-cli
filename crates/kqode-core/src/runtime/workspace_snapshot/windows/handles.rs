use std::{
    ffi::OsStr,
    fs::{File, OpenOptions},
    io,
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        fs::OpenOptionsExt,
        io::{AsRawHandle, FromRawHandle},
    },
    path::PathBuf,
    ptr,
};

use super::security::PrivateDescriptor;
use windows_sys::{
    Wdk::{
        Foundation::OBJECT_ATTRIBUTES,
        Storage::FileSystem::{
            FILE_CREATE, FILE_DIRECTORY_FILE, FILE_OPEN, FILE_OPEN_REPARSE_POINT,
            FILE_SYNCHRONOUS_IO_NONALERT, NtCreateFile,
        },
    },
    Win32::{
        Foundation::{OBJ_DONT_REPARSE, UNICODE_STRING},
        Storage::FileSystem::{
            FILE_ATTRIBUTE_NORMAL, FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS,
            FILE_FLAG_OPEN_REPARSE_POINT, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_DELETE,
            FILE_SHARE_READ, FILE_SHARE_WRITE, GetFinalPathNameByHandleW, VOLUME_NAME_GUID,
        },
        System::IO::IO_STATUS_BLOCK,
    },
};

/// Opens the root itself without following a final reparse point.
pub(super) fn open_root(path: &std::path::Path, writable: bool) -> io::Result<File> {
    use std::os::windows::fs::MetadataExt;
    let file = OpenOptions::new()
        .read(true)
        .write(writable)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::Error::other(
            "snapshot root must be a non-reparse directory",
        ));
    }
    Ok(file)
}

/// Opens exactly one component beneath an already opened directory.
pub(super) fn child(parent: &File, name: &OsStr, create: Option<bool>) -> io::Result<File> {
    open_child(
        parent,
        name,
        create,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
    )
}

pub(super) fn snapshot_root(parent: &File, name: &OsStr) -> io::Result<File> {
    let descriptor = PrivateDescriptor::new()?;
    open_child(
        parent,
        name,
        Some(true),
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        Some(&descriptor),
    )
}

fn open_child(
    parent: &File,
    name: &OsStr,
    create: Option<bool>,
    sharing: u32,
    security: Option<&PrivateDescriptor>,
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
        Attributes: OBJ_DONT_REPARSE,
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
        return Err(io::Error::other(format!(
            "NtCreateFile failed: NTSTATUS {result:#x}"
        )));
    }
    if handle.is_null() {
        return Err(io::Error::other("NtCreateFile returned a null handle"));
    }
    Ok(unsafe { File::from_raw_handle(handle.cast()) })
}

pub(in crate::runtime::workspace_snapshot) fn final_path(file: &File) -> io::Result<PathBuf> {
    path_by_handle(file, 0)
}

pub(super) fn volume_path(file: &File) -> io::Result<PathBuf> {
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
            return Ok(PathBuf::from(std::ffi::OsString::from_wide(
                &buffer[..count as usize],
            )));
        }
        buffer.resize(count as usize + 1, 0);
    }
}
