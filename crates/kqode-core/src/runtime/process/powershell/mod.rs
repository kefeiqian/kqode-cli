//! Native Windows shell preparation; this module does not grant sandbox permissions.

mod command;
mod discovery;
mod error;

#[cfg(all(test, windows))]
mod execution_tests;
#[cfg(all(test, windows))]
mod test_support;
#[cfg(test)]
mod tests;
#[cfg(all(test, windows))]
mod windows_tests;

pub use command::PowerShell;
pub use error::PowerShellError;
