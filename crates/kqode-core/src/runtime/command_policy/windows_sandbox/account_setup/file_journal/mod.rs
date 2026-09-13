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
pub use writer::PrivateSandboxAccountJournal;
