use std::path::Path;

use crate::{
    commands::{CommandSpec, package},
    support::bun,
};

/// Package-local Bun script that archives the standalone executable and writes checksums.
const RELEASE_SCRIPT: &str = "package-release";

pub const COMMAND: CommandSpec = CommandSpec {
    name: "package-release",
    description: "Package the host standalone executable into a release archive plus checksums",
    run,
};

/// Builds the standalone executable, then packages the host release artifacts.
///
/// Delegates the executable build to `cargo xtask package`, then runs the
/// package-local Bun script that produces `kqode-<target>.(tar.gz|zip)`, the
/// matching `kqode-<target>.sha256`, and an aggregate `checksums.txt` under
/// `tui/dist/release/`. The Bun script is the reusable archiving
/// implementation; this command is the thin Cargo-facing wrapper.
///
/// # Errors
///
/// Returns an error when the standalone build fails or the Bun release script
/// exits non-zero.
pub fn run(repo_root: &Path) -> Result<(), String> {
    package::run(repo_root)?;
    bun::run(repo_root, &["run", RELEASE_SCRIPT])
}
