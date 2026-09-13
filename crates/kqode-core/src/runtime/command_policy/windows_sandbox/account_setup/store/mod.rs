//! Fixed per-process-user storage; no environment/workspace paths or cross-user helper authority.

mod anchor;
mod known_folder;
mod marker;
mod operations;
mod storage;
#[cfg(test)]
mod tests;
mod volume;

use super::SandboxAccountSetupError as Error;
pub use storage::WindowsSandboxAccountStore;

fn checked<T>(operation: &'static str, result: std::io::Result<T>) -> Result<T, Error> {
    result.map_err(|source| Error::Storage { operation, source })
}
