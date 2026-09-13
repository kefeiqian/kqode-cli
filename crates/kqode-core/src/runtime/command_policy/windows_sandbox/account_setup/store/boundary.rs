use super::super::{guard::Guard, private_object};
use super::{Error, anchor::Anchor, checked, known_folder, overlap::overlaps, storage::DIRECTORY};
use crate::{
    cancellation::CancellationToken,
    runtime::windows_file::{open_child, volume_path},
};
use std::{
    ffi::OsStr,
    fs::File,
    io,
    path::{Path, PathBuf},
    time::Duration,
};
use windows_sys::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};

/// Reserves the current user's store namespace even before initialization.
///
/// Ancestors and an existing private root stay pinned. No marker/journal contents
/// are read and nothing is created. This is a selection guard, not OS confinement.
pub(crate) struct AccountStoreBoundary {
    anchor: Anchor,
    root: Option<File>,
    reserved: PathBuf,
}

impl AccountStoreBoundary {
    pub(crate) fn resolve(
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<Self, Error> {
        let guard = Guard::new(timeout, cancellation)?;
        guard.check()?;
        Self::at(&known_folder::local_app_data()?, &guard)
    }

    pub(super) fn at(path: &Path, guard: &Guard<'_>) -> Result<Self, Error> {
        let anchor = Anchor::open(path, guard)?;
        let reserved =
            checked("resolve protected anchor", volume_path(anchor.parent()))?.join(DIRECTORY);
        guard.check()?;
        let root = match open_child(
            anchor.parent(),
            OsStr::new(DIRECTORY),
            None,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            true,
        ) {
            Ok(root) => {
                checked(
                    "validate protected root",
                    private_object::verify(&root, true),
                )?;
                Some(root)
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(source) => {
                return Err(Error::Storage {
                    operation: "open protected root",
                    source,
                });
            }
        };
        guard.check()?;
        Ok(Self {
            anchor,
            root,
            reserved,
        })
    }

    /// Rejects an entire scope, including ancestors, rather than copying selected secrets.
    pub(crate) fn check_directory(&self, file: &File) -> Result<(), Error> {
        let path = checked("resolve requested scope", volume_path(file))?;
        if checked("compare protected scope", overlaps(&path, &self.reserved))? {
            return Err(Error::ProtectedStorageOverlap);
        }
        Ok(())
    }

    pub(crate) fn verify(
        &self,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<(), Error> {
        let guard = Guard::new(timeout, cancellation)?;
        self.anchor.verify(&guard)?;
        if let Some(root) = &self.root {
            checked(
                "revalidate protected root",
                private_object::verify(root, true),
            )?;
        }
        guard.check()
    }
}
