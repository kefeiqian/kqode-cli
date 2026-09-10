use std::{fs, path::Path, time::Instant};

use super::super::{SnapshotError, SnapshotLimits, SnapshotSummary, WorkspaceSnapshot};
use super::{handles, walk::Walker};
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};

const MAX_SUPPORTED_DEPTH: usize = 64;

pub(in crate::runtime::workspace_snapshot) fn capture(
    workspace: &WorkspacePolicy,
    destination_parent: &Path,
    limits: SnapshotLimits,
    cancellation: &CancellationToken,
) -> Result<WorkspaceSnapshot, SnapshotError> {
    if limits.max_entries == 0 {
        return Err(SnapshotError::InvalidLimit("max_entries"));
    }
    if limits.max_bytes == 0 {
        return Err(SnapshotError::InvalidLimit("max_bytes"));
    }
    if limits.max_depth == 0 || limits.max_depth > MAX_SUPPORTED_DEPTH {
        return Err(SnapshotError::InvalidLimit("max_depth (1..=64)"));
    }
    let deadline = Instant::now()
        .checked_add(limits.timeout)
        .filter(|_| !limits.timeout.is_zero())
        .ok_or(SnapshotError::InvalidLimit("timeout"))?;
    if cancellation.is_cancelled() {
        return Err(SnapshotError::Cancelled);
    }
    let source = handles::open_root(workspace.root(), false)
        .map_err(|error| SnapshotError::io("open source workspace", error))?;
    if handles::final_path(&source)
        .map_err(|error| SnapshotError::io("resolve source handle", error))?
        != workspace.root()
    {
        return Err(SnapshotError::SourceChanged(workspace.root().to_owned()));
    }
    let parent = fs::canonicalize(destination_parent)
        .map_err(|error| SnapshotError::io("resolve destination parent", error))?;
    if parent.starts_with(workspace.root()) {
        return Err(SnapshotError::DestinationInsideSource);
    }
    let parent_handle = handles::open_root(&parent, true)
        .map_err(|error| SnapshotError::io("open destination parent", error))?;
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
        limits,
        cancellation,
        deadline,
        entries: 0,
        summary: SnapshotSummary::default(),
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
    Ok(snapshot)
}
