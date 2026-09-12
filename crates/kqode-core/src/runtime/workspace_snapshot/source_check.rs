use std::path::PathBuf;

use super::{SnapshotChange, SnapshotError, SnapshotLimits, WorkspaceSnapshot};
use crate::cancellation::CancellationToken;

/// A source-side difference that prevents applying the observed copy change.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotConflictKind {
    Missing,
    AlreadyExists,
    ContentChanged,
    TypeChanged,
    AncestorChanged,
    PathChanged,
    NewDescendant,
}

/// A relative source path and the conflict observed there.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotSourceConflict {
    pub path: PathBuf,
    pub kind: SnapshotConflictKind,
}

/// Informational source preflight, not authorization or a reservation of names.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotSourceCheck {
    pub changes: Vec<SnapshotChange>,
    pub conflicts: Vec<SnapshotSourceConflict>,
}

impl WorkspaceSnapshot {
    /// Checks changed paths against source content captured in this copy's baseline.
    ///
    /// Only affected source paths, their ancestors, and direct children of removed
    /// or replaced directories are examined. Unrelated edits are not conflicts.
    /// An empty change list does not open the source. Source-root identity is
    /// checked when there are changes; source file ACLs/timestamps are not diffed.
    ///
    /// Copy and source reads share one byte budget and deadline. The entry budget
    /// covers copy entries, source component opens and source directory visits;
    /// it also bounds the baseline/copy path union. Limits are cooperative.
    ///
    /// Stop copy writers first. This method writes neither tree, returns no
    /// contents, and retains no locks after returning. Even an empty conflict
    /// list is not proof that publication is safe: name reservations, protected
    /// target policy, fresh approval and atomic source revalidation remain required.
    ///
    /// # Errors
    ///
    /// Rejects moved/replaced roots, unsafe entries or Git-control descendants,
    /// exhausted/invalid limits, cancellation, observable concurrent changes and
    /// I/O failures. Only genuine missing-name errors count as absence; errors
    /// return no partial report and leave the snapshot owned by the caller.
    pub fn check_source_conflicts(
        &self,
        limits: SnapshotLimits,
        cancellation: &CancellationToken,
    ) -> Result<SnapshotSourceCheck, SnapshotError> {
        #[cfg(windows)]
        {
            super::windows::check_source(self, limits, cancellation)
        }
        #[cfg(not(windows))]
        {
            let _ = (limits, cancellation);
            Err(SnapshotError::UnsupportedPlatform)
        }
    }
}
