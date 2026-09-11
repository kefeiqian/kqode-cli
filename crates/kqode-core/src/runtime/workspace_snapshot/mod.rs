//! Explicit disposable workspace copies, not a sandbox or an automatic writeback path.

#[cfg(windows)]
mod budget;
mod changes;
#[cfg(windows)]
mod compare;
mod error;
mod inspection;
mod snapshot;
#[cfg(all(test, windows))]
mod tests;
#[cfg(windows)]
mod windows;

pub use changes::{SnapshotChange, SnapshotEntry};
pub use error::SnapshotError;
pub use snapshot::{SnapshotLimits, SnapshotSummary, WorkspaceSnapshot};
