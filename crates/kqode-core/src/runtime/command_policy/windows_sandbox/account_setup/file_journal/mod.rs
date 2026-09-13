//! Private, first-write-only account setup persistence; never resumes or repairs a journal.

mod inspection;
mod progress;
mod records;
mod session;
mod storage;
#[cfg(test)]
pub(super) mod tests;
mod writer;

pub use inspection::{
    SandboxAccountJournalInspection, SandboxAccountJournalState, SandboxAccountPendingMutation,
};
pub(super) use storage::require_process_identity;
pub(super) use storage::validate_parent;
pub use writer::PrivateSandboxAccountJournal;
