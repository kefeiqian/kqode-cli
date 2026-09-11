use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use super::SnapshotError;
use crate::{cancellation::CancellationToken, runtime::WorkspacePolicy};

/// Explicit copy limits, checked between synchronous filesystem operations.
///
/// This is not a hard wall-clock bound on a blocked OS I/O call. Async adapters
/// must not perform preparation on their executor thread.
#[derive(Clone, Copy, Debug)]
pub struct SnapshotLimits {
    pub max_entries: usize,
    pub max_bytes: u64,
    pub max_depth: usize,
    pub timeout: Duration,
}

/// Captured default-stream data; ACLs, alternate streams and Git metadata are not imported.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SnapshotSummary {
    pub files: usize,
    pub directories: usize,
    pub bytes: u64,
    /// `.git` entries are deliberately omitted, including worktree pointer files.
    pub excluded_git_paths: Vec<PathBuf>,
}

/// Owns a disposable copy. Mutating it never automatically publishes to the source.
///
/// Capture does not grant sandbox access or imply a filesystem enforcement
/// capability. A future adapter must explicitly approve snapshot execution and
/// separately validate/approve publication, especially protected paths.
pub struct WorkspaceSnapshot {
    pub(super) source: PathBuf,
    pub(super) root: PathBuf,
    pub(super) summary: SnapshotSummary,
    #[cfg(windows)]
    pub(super) baseline: super::changes::Inventory,
    #[cfg(windows)]
    pub(super) directory: Option<std::fs::File>,
}

impl WorkspaceSnapshot {
    /// Copies regular default streams into fresh file objects on native Windows.
    ///
    /// The destination parent must exist outside the source workspace, on a volume
    /// supporting GUID paths and the required native file information queries. All child
    /// traversal/creation is relative to open directory handles, not concatenated
    /// paths. Reparse points and named streams fail closed; source ACLs and hard
    /// link topology are never copied. Special Win32 filenames are rejected.
    /// Git control entries are explicitly excluded, so this is not a transparent
    /// replacement for the original cwd or a Git worktree.
    /// This is not a transactionally consistent
    /// filesystem snapshot: observable concurrent edits cause failure.
    ///
    /// # Errors
    ///
    /// Rejects unsupported platforms/entries, invalid limits, cancellation,
    /// exhausted limits, source changes or I/O failures; cleans up partial copies.
    pub fn capture(
        workspace: &WorkspacePolicy,
        destination_parent: &Path,
        limits: SnapshotLimits,
        cancellation: &CancellationToken,
    ) -> Result<Self, SnapshotError> {
        #[cfg(windows)]
        {
            super::windows::capture(workspace, destination_parent, limits, cancellation)
        }
        #[cfg(not(windows))]
        {
            let _ = (workspace, destination_parent, limits, cancellation);
            Err(SnapshotError::UnsupportedPlatform)
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn source(&self) -> &Path {
        &self.source
    }
    pub fn summary(&self) -> &SnapshotSummary {
        &self.summary
    }

    /// Confirms that the owned directory still has its frozen execution path.
    ///
    /// # Errors
    ///
    /// Refuses closed/moved copies, unsupported platforms, and handle-query errors.
    pub(crate) fn validate_location(&self) -> Result<(), SnapshotError> {
        #[cfg(windows)]
        {
            let directory = self
                .directory
                .as_ref()
                .ok_or(SnapshotError::SnapshotMoved)?;
            let current = super::windows::final_path(directory)
                .map_err(|error| SnapshotError::io("revalidate snapshot location", error))?;
            if current != self.root {
                return Err(SnapshotError::SnapshotMoved);
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            Err(SnapshotError::UnsupportedPlatform)
        }
    }

    /// Pins and checks every private-copy object before native access is granted.
    #[cfg(windows)]
    pub(crate) fn execution_files(
        &self,
        limit: usize,
        cancellation: &CancellationToken,
    ) -> Result<Vec<std::fs::File>, SnapshotError> {
        self.validate_location()?;
        super::windows::execution_files(
            self.directory
                .as_ref()
                .ok_or(SnapshotError::SnapshotMoved)?,
            limit,
            cancellation,
        )
    }

    /// Removes this owned temporary tree, reporting cleanup errors explicitly.
    ///
    /// # Errors
    ///
    /// Returns an error when the tree cannot be removed. Stop all users of this
    /// directory before closing; future sandbox adapters must join descendants.
    pub fn close(mut self) -> Result<(), SnapshotError> {
        self.cleanup()
    }

    fn cleanup(&mut self) -> Result<(), SnapshotError> {
        if self.root.as_os_str().is_empty() {
            return Ok(());
        }
        #[cfg(windows)]
        {
            if let Some(directory) = self.directory.as_ref() {
                // Resolve the owned handle before releasing its delete-sharing lock.
                self.root = super::windows::final_path(directory)
                    .map_err(|error| SnapshotError::io("resolve snapshot for cleanup", error))?;
            }
            self.directory.take();
        }
        std::fs::remove_dir_all(&self.root)
            .map_err(|error| SnapshotError::io("remove workspace snapshot", error))?;
        self.root.clear();
        Ok(())
    }
}

impl Drop for WorkspaceSnapshot {
    fn drop(&mut self) {
        if let Err(error) = self.cleanup() {
            eprintln!("workspace snapshot cleanup failed: {error}");
        }
    }
}
