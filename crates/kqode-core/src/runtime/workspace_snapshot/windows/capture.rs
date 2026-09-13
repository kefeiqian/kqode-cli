use std::{fs, path::Path};

use super::super::budget::Budget;
use super::super::{SnapshotError, SnapshotLimits, SnapshotSummary, WorkspaceSnapshot};
use super::{ObjectIdentity, handles, walk::Walker};
use crate::runtime::command_policy::AccountStoreBoundary;
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};

pub(in crate::runtime::workspace_snapshot) fn capture(
    workspace: &WorkspacePolicy,
    destination_parent: &Path,
    limits: SnapshotLimits,
    cancellation: &CancellationToken,
) -> Result<WorkspaceSnapshot, SnapshotError> {
    let budget = Budget::new(limits, cancellation)?;
    let protection = AccountStoreBoundary::resolve(limits.timeout, cancellation)
        .map_err(SnapshotError::AccountStorage)?;
    let source = handles::open_root(workspace.root(), false)
        .map_err(|error| SnapshotError::io("open source workspace", error))?;
    if handles::final_path(&source)
        .map_err(|error| SnapshotError::io("resolve source handle", error))?
        != workspace.root()
    {
        return Err(SnapshotError::SourceChanged(workspace.root().to_owned()));
    }
    let source_identity = ObjectIdentity::read(&source)?;
    protection
        .check_directory(&source)
        .map_err(SnapshotError::AccountStorage)?;
    let parent = fs::canonicalize(destination_parent)
        .map_err(|error| SnapshotError::io("resolve destination parent", error))?;
    if parent.starts_with(workspace.root()) {
        return Err(SnapshotError::DestinationInsideSource);
    }
    let parent_handle = handles::open_root(&parent, true)
        .map_err(|error| SnapshotError::io("open destination parent", error))?;
    protection
        .check_directory(&parent_handle)
        .map_err(SnapshotError::AccountStorage)?;
    budget.check()?;
    let source_volume_path = handles::volume_path(&source)
        .map_err(|error| SnapshotError::io("resolve source volume path", error))?;
    if handles::volume_path(&parent_handle)
        .map_err(|error| SnapshotError::io("resolve destination volume path", error))?
        .starts_with(&source_volume_path)
    {
        return Err(SnapshotError::DestinationInsideSource);
    }
    let name = format!("kqode-snapshot-{}", uuid::Uuid::new_v4());
    let directory = handles::snapshot_root(&parent_handle, name.as_ref())
        .map_err(|error| SnapshotError::io("create snapshot directory", error))?;
    let mut snapshot = WorkspaceSnapshot {
        source: workspace.root().to_owned(),
        root: parent.join(&name),
        directory: Some(directory),
        summary: SnapshotSummary::default(),
        baseline: Default::default(),
        source_identity,
    };
    snapshot.root = handles::final_path(snapshot.directory.as_ref().unwrap())
        .map_err(|error| SnapshotError::io("resolve snapshot directory", error))?;
    if handles::volume_path(snapshot.directory.as_ref().unwrap())
        .map_err(|error| SnapshotError::io("resolve snapshot volume path", error))?
        .starts_with(&source_volume_path)
    {
        return Err(SnapshotError::DestinationInsideSource);
    }
    let mut walker = Walker {
        budget,
        summary: SnapshotSummary::default(),
        baseline: Default::default(),
    };
    walker.directory(
        &source,
        snapshot.directory.as_ref().unwrap(),
        Path::new(""),
        0,
    )?;
    if handles::final_path(&source)
        .map_err(|error| SnapshotError::io("recheck source handle", error))?
        != workspace.root()
    {
        return Err(SnapshotError::SourceChanged(workspace.root().to_owned()));
    }
    snapshot.summary = walker.summary;
    snapshot.baseline = walker.baseline;
    if ObjectIdentity::read(&source)? != snapshot.source_identity {
        return Err(SnapshotError::SourceRootChanged);
    }
    protection
        .verify(limits.timeout, cancellation)
        .map_err(SnapshotError::AccountStorage)?;
    walker.budget.check()?;
    Ok(snapshot)
}
