use super::{SnapshotChange, SnapshotError, SnapshotLimits, WorkspaceSnapshot};
use crate::cancellation::CancellationToken;

impl WorkspaceSnapshot {
    /// Compares the owned copy with content hashed while it was captured.
    ///
    /// Returns changes ordered by relative path, including empty directories.
    /// Never reads, checks freshness of, or writes the source workspace.
    /// `max_bytes` bounds current file data read; `max_entries` bounds both the
    /// current tree and the baseline/current path union, including deletions.
    /// Cancellation and deadlines are cooperative, as during capture.
    ///
    /// Stop all copy writers and descendants before calling. Handles prevent
    /// ordinary file write/delete sharing during the scan, but directory-entry
    /// changes are not transactionally frozen. Observable changes fail closed.
    /// The result is an inspection, not a publication approval or immutable seal.
    ///
    /// # Errors
    ///
    /// Rejects invalid/exhausted limits, cancellation, moved copies, reparse
    /// points, hard-linked files, named streams, Git control entries, special
    /// filenames, observable concurrent changes, and I/O failures. Errors return
    /// no partial report and leave the owned copy available for explicit cleanup.
    pub fn inspect_changes(
        &self,
        limits: SnapshotLimits,
        cancellation: &CancellationToken,
    ) -> Result<Vec<SnapshotChange>, SnapshotError> {
        #[cfg(windows)]
        {
            super::windows::inspect(self, limits, cancellation)
        }
        #[cfg(not(windows))]
        {
            let _ = (limits, cancellation);
            Err(SnapshotError::UnsupportedPlatform)
        }
    }
}
