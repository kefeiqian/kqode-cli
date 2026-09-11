use std::path::{Path, PathBuf};

/// Default-stream content or an explicit directory, without ACLs or timestamps.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotEntry {
    Directory,
    File { bytes: u64, sha256: [u8; 32] },
}

/// A relative-path observation against the immutable copy-time baseline.
///
/// Type replacements are modifications; renames are additions and deletions.
/// These observations neither authorize publication nor seal future contents.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SnapshotChange {
    Added {
        path: PathBuf,
        entry: SnapshotEntry,
    },
    Modified {
        path: PathBuf,
        before: SnapshotEntry,
        after: SnapshotEntry,
    },
    Deleted {
        path: PathBuf,
        entry: SnapshotEntry,
    },
}

impl SnapshotChange {
    /// Returns the observed path relative to the owned copy root.
    pub fn path(&self) -> &Path {
        match self {
            Self::Added { path, .. } | Self::Modified { path, .. } | Self::Deleted { path, .. } => {
                path
            }
        }
    }
}

#[cfg(windows)]
pub(super) type Inventory = std::collections::BTreeMap<PathBuf, SnapshotEntry>;
