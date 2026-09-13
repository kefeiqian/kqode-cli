//! Strict read-only inspection, not authority to resume setup or enable accounts.

mod input;
mod parser;
mod report;
#[cfg(test)]
mod tests;
mod wire;

use parser::invalid;
pub use report::{
    SandboxAccountJournalInspection, SandboxAccountJournalState, SandboxAccountPendingMutation,
};
