use std::path::{Path, PathBuf};

use crate::runtime::SnapshotSummary;
use serde::{Deserialize, Serialize};

/// Explicit execution semantics; a copy is never substituted silently for the original cwd.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceExecutionMode {
    OriginalWorkspace,
    DisposableSnapshot,
}

/// Immutable source-to-execution mapping shown to policy, approval and backend.
///
/// A snapshot has no automatic writeback and may omit Git control entries. The
/// capture summary describes preparation, not live contents or a cryptographic
/// content seal. Backends must enforce path boundaries at execution time.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommandWorkspace {
    mode: WorkspaceExecutionMode,
    source_root: PathBuf,
    source_cwd: PathBuf,
    execution_root: PathBuf,
    execution_cwd: PathBuf,
    capture_summary: Option<SnapshotSummary>,
}

impl CommandWorkspace {
    pub(super) fn original(root: PathBuf, cwd: PathBuf) -> Self {
        Self {
            mode: WorkspaceExecutionMode::OriginalWorkspace,
            source_root: root.clone(),
            source_cwd: cwd.clone(),
            execution_root: root,
            execution_cwd: cwd,
            capture_summary: None,
        }
    }

    pub(super) fn snapshot(
        source_root: PathBuf,
        source_cwd: PathBuf,
        execution_root: PathBuf,
        execution_cwd: PathBuf,
        summary: SnapshotSummary,
    ) -> Self {
        Self {
            mode: WorkspaceExecutionMode::DisposableSnapshot,
            source_root,
            source_cwd,
            execution_root,
            execution_cwd,
            capture_summary: Some(summary),
        }
    }

    pub fn mode(&self) -> WorkspaceExecutionMode {
        self.mode
    }
    pub fn source_root(&self) -> &Path {
        &self.source_root
    }
    pub fn source_cwd(&self) -> &Path {
        &self.source_cwd
    }
    pub fn execution_root(&self) -> &Path {
        &self.execution_root
    }
    pub fn execution_cwd(&self) -> &Path {
        &self.execution_cwd
    }
    pub fn capture_summary(&self) -> Option<&SnapshotSummary> {
        self.capture_summary.as_ref()
    }
}
