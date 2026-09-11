use sha2::{Digest, Sha256};
use std::{
    fs::{File, Metadata},
    io::Read,
    path::{Path, PathBuf},
};

use super::super::{
    SnapshotChange, SnapshotEntry, SnapshotError, SnapshotLimits, WorkspaceSnapshot,
    budget::Budget, changes::Inventory, compare::compare,
};
use super::{directory, entry, handles, inspection_handles, names};
use crate::cancellation::CancellationToken;

const READ_BUFFER_BYTES: usize = 64 * 1024;

#[cfg(test)]
mod tests;

pub(in crate::runtime::workspace_snapshot) fn inspect(
    snapshot: &WorkspaceSnapshot,
    limits: SnapshotLimits,
    cancellation: &CancellationToken,
) -> Result<Vec<SnapshotChange>, SnapshotError> {
    let budget = Budget::new(limits, cancellation)?;
    if snapshot.baseline.len() > limits.max_entries {
        return Err(SnapshotError::LimitExceeded("max_entries"));
    }
    snapshot.validate_location()?;
    let root = inspection_handles::root(
        snapshot
            .directory
            .as_ref()
            .ok_or(SnapshotError::SnapshotMoved)?,
    )?;
    let mut scan = Scan {
        budget,
        current: Inventory::new(),
        pinned: Vec::new(),
    };
    scan.walk(root, Path::new(""), 0)?;
    let changes = compare(&snapshot.baseline, &scan.current, &scan.budget)?;
    scan.validate()?;
    snapshot.validate_location()?;
    scan.budget.check()?;
    Ok(changes)
}

struct Scan<'a> {
    budget: Budget<'a>,
    current: Inventory,
    pinned: Vec<(PathBuf, File, Metadata)>,
}

impl Scan<'_> {
    fn validate(&self) -> Result<(), SnapshotError> {
        for (path, file, before) in &self.pinned {
            self.budget.check()?;
            let after = entry::inspect(file, path)?;
            if before.is_file() {
                inspection_handles::single_link(file, path)?;
            }
            if !entry::unchanged(before, &after) {
                return Err(SnapshotError::SnapshotChanged(path.clone()));
            }
        }
        Ok(())
    }

    fn walk(&mut self, mut file: File, relative: &Path, depth: usize) -> Result<(), SnapshotError> {
        self.budget.check()?;
        let before = entry::inspect(&file, relative)?;
        let observed = if before.is_dir() {
            if depth > self.budget.limits.max_depth {
                return Err(SnapshotError::LimitExceeded("max_depth"));
            }

            directory::visit(&file, |name| {
                self.budget.entry()?;
                let path = relative.join(name);
                let text = name
                    .to_str()
                    .ok_or_else(|| entry::unsupported(&path, "non-Unicode filename"))?;
                if text.eq_ignore_ascii_case(".git") {
                    return Err(entry::unsupported(
                        &path,
                        "Git control artifacts are not supported",
                    ));
                }
                if !names::ordinary(text) {
                    return Err(entry::unsupported(
                        &path,
                        "filename has special Win32 semantics",
                    ));
                }
                let child = handles::inspection_child(&file, name)
                    .map_err(|error| SnapshotError::io("open artifact entry", error))?;
                self.walk(child, &path, depth + 1)
            })?;
            SnapshotEntry::Directory
        } else if before.is_file() {
            inspection_handles::single_link(&file, relative)?;
            self.read_file(&mut file, relative, before.len())?
        } else {
            return Err(entry::unsupported(
                relative,
                "not a regular file or directory",
            ));
        };
        if !relative.as_os_str().is_empty()
            && self.current.insert(relative.to_owned(), observed).is_some()
        {
            return Err(SnapshotError::SnapshotChanged(relative.to_owned()));
        }
        self.pinned.push((relative.to_owned(), file, before));
        Ok(())
    }

    fn read_file(
        &mut self,
        file: &mut File,
        path: &Path,
        bytes: u64,
    ) -> Result<SnapshotEntry, SnapshotError> {
        if bytes > self.budget.remaining_bytes() {
            return Err(SnapshotError::LimitExceeded("max_bytes"));
        }
        let mut remaining = bytes;
        let mut buffer = [0u8; READ_BUFFER_BYTES];
        let mut digest = Sha256::new();
        while remaining != 0 {
            self.budget.check()?;
            let length = remaining.min(buffer.len() as u64) as usize;
            let count = file
                .read(&mut buffer[..length])
                .map_err(|error| SnapshotError::io("read artifact data", error))?;
            if count == 0 {
                return Err(SnapshotError::SnapshotChanged(path.to_owned()));
            }
            remaining -= count as u64;
            self.budget.bytes += count as u64;
            digest.update(&buffer[..count]);
        }
        Ok(SnapshotEntry::File {
            bytes,
            sha256: digest.finalize().into(),
        })
    }
}
