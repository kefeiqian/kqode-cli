//! Read-only recorded/live comparisons; never adoption, repair, activation or an execution grant.

mod compare;
mod engine;
mod report;
#[cfg(test)]
mod tests;

pub(super) use engine::ReadHost;
pub(super) use engine::run;
pub(super) const MAX_MEMBERS: usize = 256;
pub use report::{SandboxAccountDiscrepancy, SandboxAccountReconciliation};
