use std::path::Path;

use super::super::{
    SnapshotChange, SnapshotConflictKind as Kind, SnapshotError, SnapshotLimits,
    SnapshotSourceCheck, SnapshotSourceConflict, WorkspaceSnapshot, budget::Budget,
};
use super::{
    ObjectIdentity, handles, inspection,
    source_lookup::{self, Location, Pinned},
    source_targets,
};
use crate::cancellation::CancellationToken;

pub(in crate::runtime::workspace_snapshot) fn check_source(
    snapshot: &WorkspaceSnapshot,
    limits: SnapshotLimits,
    cancellation: &CancellationToken,
) -> Result<SnapshotSourceCheck, SnapshotError> {
    let mut budget = Budget::new(limits, cancellation)?;
    let changes = inspection::with_budget(snapshot, &mut budget)?;
    let mut conflicts = Vec::new();
    if changes.is_empty() {
        return Ok(SnapshotSourceCheck { changes, conflicts });
    }
    source_targets::protected(snapshot, &changes, &budget)?;
    budget.check()?;
    let file = handles::open_root(&snapshot.source, false)
        .map_err(|error| SnapshotError::io("open source conflict root", error))?;
    if ObjectIdentity::read(&file)? != snapshot.source_identity {
        return Err(SnapshotError::SourceRootChanged);
    }
    let root = Pinned::new(file, Path::new(""))?;
    let mut pins = Vec::new();
    for change in &changes {
        budget.check()?;
        if source_targets::has_new_directory_ancestor(change, &changes, &budget)? {
            continue;
        }
        let mut lookup =
            source_lookup::locate(&root.file, &snapshot.source, change.path(), &mut budget)?;
        let kind = match lookup.location {
            Location::Missing(ref missing) => {
                if missing != change.path() && snapshot.baseline.contains_key(missing) {
                    Some(Kind::AncestorChanged)
                } else {
                    (!matches!(change, SnapshotChange::Added { .. })).then_some(Kind::Missing)
                }
            }
            Location::AncestorChanged => Some(Kind::AncestorChanged),
            Location::PathChanged => Some(Kind::PathChanged),
            Location::Found => {
                let target = lookup.pins.last_mut().ok_or_else(|| {
                    super::entry::unsupported(change.path(), "source target cannot be the root")
                })?;
                source_targets::compare_target(
                    snapshot,
                    change,
                    target,
                    &mut budget,
                    &mut conflicts,
                )?
            }
        };
        if let Some(kind) = kind {
            conflicts.push(SnapshotSourceConflict {
                path: change.path().to_owned(),
                kind,
            });
        }
        pins.extend(lookup.pins);
    }
    for pin in &pins {
        budget.check()?;
        pin.validate()?;
    }
    budget.check()?;
    root.validate()?;
    if ObjectIdentity::read(&root.file)? != snapshot.source_identity {
        return Err(SnapshotError::SourceRootChanged);
    }
    snapshot.validate_location()?;
    conflicts.sort_by(|left, right| left.path.cmp(&right.path));
    conflicts.dedup();
    budget.check()?;
    Ok(SnapshotSourceCheck { changes, conflicts })
}
