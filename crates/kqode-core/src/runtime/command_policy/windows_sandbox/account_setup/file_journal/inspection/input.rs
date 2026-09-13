use super::super::super::private_object::verify as verify_object;
use super::super::{super::WindowsSandboxAccountPlan, PrivateSandboxAccountJournal, storage};
use super::{SandboxAccountJournalInspection, invalid, parser};
use crate::runtime::windows_file::open_child;
use std::{
    ffi::OsStr,
    fs::File,
    io::{self, Read},
};
use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ;

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
