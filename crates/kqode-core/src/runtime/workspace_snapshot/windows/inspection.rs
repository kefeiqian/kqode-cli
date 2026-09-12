use std::{
    fs::{File, Metadata},
    path::{Path, PathBuf},
};

use super::super::{
    SnapshotChange, SnapshotEntry, SnapshotError, SnapshotLimits, WorkspaceSnapshot,
    budget::Budget, changes::Inventory, compare::compare,
};
use super::{directory, entry, handles, inspection_handles, names, read_data::read_data};
use crate::cancellation::CancellationToken;

#[cfg(test)]
mod tests;

pub(in crate::runtime::workspace_snapshot) fn inspect(
    snapshot: &WorkspaceSnapshot,
    limits: SnapshotLimits,
    cancellation: &CancellationToken,
) -> Result<Vec<SnapshotChange>, SnapshotError> {
    let mut budget = Budget::new(limits, cancellation)?;
    with_budget(snapshot, &mut budget)
}

pub(super) fn with_budget(
    snapshot: &WorkspaceSnapshot,
    budget: &mut Budget<'_>,
) -> Result<Vec<SnapshotChange>, SnapshotError> {
    if snapshot.baseline.len() > budget.limits.max_entries {
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
    let changes = compare(&snapshot.baseline, &scan.current, scan.budget)?;
    scan.validate()?;
    snapshot.validate_location()?;
    scan.budget.check()?;
    Ok(changes)
}

struct Scan<'a, 'b> {
    budget: &'a mut Budget<'b>,
    current: Inventory,
    pinned: Vec<(PathBuf, File, Metadata)>,
}

impl Scan<'_, '_> {
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
            read_data(
                &mut file,
                relative,
                before.len(),
                self.budget,
                SnapshotError::SnapshotChanged,
            )?
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
}
