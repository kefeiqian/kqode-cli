//! Explicit disposable workspace copies, not a sandbox or an automatic writeback path.

mod error;
mod snapshot;
#[cfg(all(test, windows))]
mod tests;
#[cfg(windows)]
mod windows;

pub use error::SnapshotError;
pub use snapshot::{SnapshotLimits, SnapshotSummary, WorkspaceSnapshot};
