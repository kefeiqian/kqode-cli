use super::super::{
    SnapshotChange, SnapshotConflictKind as Kind, SnapshotEntry, SnapshotError,
    SnapshotSourceConflict, WorkspaceSnapshot, budget::Budget,
};
use super::{directory, entry, names, read_data::read_data, source_lookup::Pinned};

/// Prevents a parent replacement/deletion from encompassing omitted Git controls.
pub(super) fn protected(
    snapshot: &WorkspaceSnapshot,
    changes: &[SnapshotChange],
    budget: &Budget<'_>,
) -> Result<(), SnapshotError> {
    if snapshot.summary.excluded_git_paths.len() > budget.limits.max_entries {
        return Err(SnapshotError::LimitExceeded("max_entries"));
    }
    for excluded in &snapshot.summary.excluded_git_paths {
        // Ancestors of an excluded path can only be directories in the captured tree.
        for ancestor in excluded.ancestors().skip(1) {
            budget.check()?;
            if changes
                .binary_search_by(|change| change.path().cmp(ancestor))
                .is_ok()
            {
                return Err(entry::unsupported(
                    excluded,
                    "Git control descendants cannot be published",
                ));
            }
        }
    }
    Ok(())
}

/// Compares an existing target and lists new children of destructively changed directories.
pub(super) fn compare_target(
    snapshot: &WorkspaceSnapshot,
    change: &SnapshotChange,
    target: &mut Pinned,
    budget: &mut Budget<'_>,
    conflicts: &mut Vec<SnapshotSourceConflict>,
) -> Result<Option<Kind>, SnapshotError> {
    let before = match change {
        SnapshotChange::Added { .. } => return Ok(Some(Kind::AlreadyExists)),
        SnapshotChange::Deleted { entry, .. } => entry,
        SnapshotChange::Modified { before, .. } => before,
    };

    match before {
        SnapshotEntry::File { .. } if target.metadata.is_file() => {
            let actual = read_data(
                &mut target.file,
                &target.path,
                target.metadata.len(),
                budget,
                SnapshotError::SourceChanged,
            )?;
            Ok((actual != *before).then_some(Kind::ContentChanged))
        }
        SnapshotEntry::Directory if target.metadata.is_dir() => {
            directory::visit(&target.file, |name| {
                budget.entry()?;
                let path = target.path.join(name);
                let text = name
                    .to_str()
                    .ok_or_else(|| entry::unsupported(&path, "non-Unicode filename"))?;
                if text.eq_ignore_ascii_case(".git") {
                    return Err(entry::unsupported(
                        &path,
                        "Git control descendants cannot be published",
                    ));
                }
                if !names::ordinary(text) {
                    return Err(entry::unsupported(
                        &path,
                        "filename has special Win32 semantics",
                    ));
                }
                if !snapshot.baseline.contains_key(&path) {
                    conflicts.push(SnapshotSourceConflict {
                        path,
                        kind: Kind::NewDescendant,
                    });
                }
                Ok(())
            })?;
            Ok(None)
        }
        _ => Ok(Some(Kind::TypeChanged)),
    }
}

/// Descendants of a newly created directory are checked through that parent's change.
pub(super) fn has_new_directory_ancestor(
    change: &SnapshotChange,
    changes: &[SnapshotChange],
    budget: &Budget<'_>,
) -> Result<bool, SnapshotError> {
    for ancestor in change.path().ancestors().skip(1) {
        budget.check()?;
        if let Ok(index) = changes.binary_search_by(|change| change.path().cmp(ancestor))
            && matches!(
                changes[index],
                SnapshotChange::Added {
                    entry: SnapshotEntry::Directory,
                    ..
                } | SnapshotChange::Modified {
                    before: SnapshotEntry::File { .. },
                    after: SnapshotEntry::Directory,
                    ..
                }
            )
        {
            return Ok(true);
        }
    }
    Ok(false)
}
