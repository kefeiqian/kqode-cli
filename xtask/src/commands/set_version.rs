use std::path::Path;

use crate::{commands::CommandSpec, support::version};

pub const COMMAND: CommandSpec = CommandSpec {
    name: "set-version",
    description: "Set the product version across all manifests and Cargo.lock (usage: set-version <X.Y.Z>)",
    run,
};

/// Sets the product version across every manifest and refreshes `Cargo.lock`.
///
/// The target version is read from the process arguments (`cargo xtask
/// set-version <X.Y.Z>`); the xtask dispatcher consumes argument 1 as the
/// command name, so the version is argument 2.
///
/// # Errors
///
/// Returns an error when no version argument is supplied or the manifest/lock
/// update fails.
pub fn run(repo_root: &Path) -> Result<(), String> {
    let version = std::env::args()
        .nth(2)
        .ok_or_else(|| "usage: cargo xtask set-version <MAJOR.MINOR.PATCH>".to_string())?;
    version::set_all(repo_root, &version)
}
