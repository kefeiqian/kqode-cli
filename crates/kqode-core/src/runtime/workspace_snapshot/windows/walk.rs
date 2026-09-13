use std::{
    fs::{File, Metadata},
    io::{Read, Write},
    path::Path,
};

use sha2::{Digest, Sha256};

use super::super::{
    SnapshotEntry, SnapshotError, SnapshotSummary, budget::Budget, changes::Inventory,
};
use super::{
    directory,
    entry::{inspect, unchanged, unsupported},
    handles,
    inspection_handles::single_link,
    names,
};

const COPY_BUFFER_BYTES: usize = 64 * 1024;

pub(super) struct Walker<'a> {
    pub budget: Budget<'a>,
    pub summary: SnapshotSummary,
    pub baseline: Inventory,
}

impl Walker<'_> {
    pub fn directory(
        &mut self,
        source: &File,
        destination: &File,
        relative: &Path,
        depth: usize,
    ) -> Result<(), SnapshotError> {
        self.budget.check()?;
        let before = inspect(source, relative)?;
        if !before.is_dir() {
            return Err(unsupported(relative, "not a directory"));
        }
        if depth > self.budget.limits.max_depth {
            return Err(SnapshotError::LimitExceeded("max_depth"));
        }
        directory::visit(source, |name| {
            self.budget.entry()?;
            let child_path = relative.join(name);
            let text = name
                .to_str()
                .ok_or_else(|| unsupported(&child_path, "non-Unicode filename"))?;
            if text.eq_ignore_ascii_case(".git") {
                self.summary.excluded_git_paths.push(child_path);
                return Ok(());
            }
            if !names::ordinary(text) {
                return Err(unsupported(
                    &child_path,
                    "filename has special Win32 semantics",
                ));
            }
            let child = handles::child(source, name, None)
                .map_err(|error| SnapshotError::io("open source entry", error))?;
            let metadata = inspect(&child, &child_path)?;
            if metadata.is_file() {
                single_link(&child, &child_path)?;
            }
            let mut output = handles::child(destination, name, Some(metadata.is_dir()))
                .map_err(|error| SnapshotError::io("create snapshot entry", error))?;
            if metadata.is_dir() {
                self.summary.directories += 1;
                self.baseline
                    .insert(child_path.clone(), SnapshotEntry::Directory);
                self.directory(&child, &output, &child_path, depth + 1)
            } else if metadata.is_file() {
                self.copy_file(child, &mut output, &child_path, metadata)
            } else {
                Err(unsupported(&child_path, "not a regular file or directory"))
            }
        })?;
        if !unchanged(
            &before,
            &source
                .metadata()
                .map_err(|error| SnapshotError::io("recheck source directory", error))?,
        ) {
            return Err(SnapshotError::SourceChanged(relative.to_owned()));
        }
        self.budget.check()
    }

    fn copy_file(
        &mut self,
        mut source: File,
        output: &mut File,
        relative: &Path,
        before: Metadata,
    ) -> Result<(), SnapshotError> {
        if before.len() > self.budget.remaining_bytes() {
            return Err(SnapshotError::LimitExceeded("max_bytes"));
        }
        let mut buffer = [0u8; COPY_BUFFER_BYTES];
        let mut copied = 0u64;
        let mut digest = Sha256::new();
        loop {
            self.budget.check()?;
            let count = source
                .read(&mut buffer)
                .map_err(|error| SnapshotError::io("read source file", error))?;
            if count == 0 {
                break;
            }
            if count as u64 > self.budget.remaining_bytes() {
                return Err(SnapshotError::LimitExceeded("max_bytes"));
            }
            output
                .write_all(&buffer[..count])
                .map_err(|error| SnapshotError::io("write snapshot file", error))?;
            self.summary.bytes += count as u64;
            self.budget.bytes += count as u64;
            digest.update(&buffer[..count]);
            copied += count as u64;
        }
        if copied != before.len() {
            return Err(SnapshotError::SourceChanged(relative.to_owned()));
        }
        single_link(&source, relative)?;
        if !unchanged(
            &before,
            &source
                .metadata()
                .map_err(|error| SnapshotError::io("recheck source file", error))?,
        ) {
            return Err(SnapshotError::SourceChanged(relative.to_owned()));
        }
        self.summary.files += 1;
        self.baseline.insert(
            relative.to_owned(),
            SnapshotEntry::File {
                bytes: copied,
                sha256: digest.finalize().into(),
            },
        );
        Ok(())
    }
}
