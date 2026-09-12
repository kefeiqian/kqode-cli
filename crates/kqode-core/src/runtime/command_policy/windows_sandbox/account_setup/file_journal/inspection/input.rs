use super::super::{super::WindowsSandboxAccountPlan, PrivateSandboxAccountJournal, storage};
use super::{SandboxAccountJournalInspection, acl, invalid, parser};
use crate::runtime::{windows_file::open_child, windows_streams::has_named_stream};
use std::{
    ffi::OsStr,
    fs::File,
    io::{self, Read},
    os::windows::{fs::MetadataExt, io::AsRawHandle},
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_SHARE_READ, FILE_STANDARD_INFO, FileStandardInfo,
    GetFileInformationByHandleEx,
};

impl PrivateSandboxAccountJournal {
    /// Inspects existing private state without changing files, credentials or SAM objects.
    ///
    /// Requires the same trusted stable parent boundary as `new`. Returns recorded
    /// observations only: a missing intent receipt means the mutation's outcome is
    /// unknown, and even a completed journal must be reconciled against live SAM.
    /// Locks last only for this call; this is not a mutation lease or execution grant.
    ///
    /// # Errors
    ///
    /// Fails closed on missing/torn/invalid state, unexpected ownership/ACLs,
    /// reparse/stream/hardlink aliases, unverified passwords or concurrent writers.
    /// It never repairs, truncates, reopens for append or resumes setup.
    pub fn inspect(
        parent: &File,
        expected: &WindowsSandboxAccountPlan,
    ) -> io::Result<SandboxAccountJournalInspection> {
        storage::validate_parent(parent)?;
        let directory = open_child(
            parent,
            OsStr::new(&storage::directory_name(expected)),
            None,
            FILE_SHARE_READ,
            None,
            true,
        )?;
        verify_object(&directory, true)?;
        let mut file = open_child(
            &directory,
            OsStr::new(storage::JOURNAL_FILENAME),
            None,
            FILE_SHARE_READ,
            None,
            true,
        )?;
        verify_object(&file, false)?;
        if file.metadata()?.len() > parser::MAX_JOURNAL_BYTES as u64 {
            return Err(invalid("account journal exceeds its byte limit"));
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(parser::MAX_JOURNAL_BYTES as u64 + 1)
            .read_to_end(&mut bytes)?;
        let inspection = parser::parse(&bytes, expected)?;
        verify_object(&file, false)?;
        verify_object(&directory, true)?;
        Ok(inspection)
    }
}

fn verify_object(file: &File, directory: bool) -> io::Result<()> {
    let metadata = file.metadata()?;
    if metadata.is_dir() != directory
        || (!directory && !metadata.is_file())
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(invalid(
            "journal object type or reparse attributes are invalid",
        ));
    }
    let mut info = FILE_STANDARD_INFO::default();
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle().cast(),
            FileStandardInfo,
            (&mut info as *mut FILE_STANDARD_INFO).cast(),
            size_of::<FILE_STANDARD_INFO>() as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if info.DeletePending || (!directory && info.NumberOfLinks != 1) {
        return Err(invalid(
            "journal object is pending deletion or has hardlink aliases",
        ));
    }
    acl::verify(file)?;
    if has_named_stream(file, directory)? {
        return Err(invalid("journal object has named streams"));
    }
    Ok(())
}
