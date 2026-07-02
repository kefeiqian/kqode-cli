use std::path::Path;

use crate::{
    commands::CommandSpec,
    support::{bun, cargo},
};

/// Cargo bin target embedded into the packaged executable as the backend.
const BACKEND_BIN: &str = "kqode";

/// Package-local Bun script that stages the backend and runs `bun build --compile`.
const PACKAGE_SCRIPT: &str = "package";

pub const COMMAND: CommandSpec = CommandSpec {
    name: "package",
    description: "Build the self-contained packaged kqode executable (Rust release + Bun compile)",
    run,
};

/// Builds the self-contained packaged `kqode` executable.
///
/// Compiles the Rust backend in release mode, then delegates to the package-local
/// Bun script, which stages that binary as an embeddable asset and compiles the
/// standalone executable into `tui/dist/`. The Bun script is the reusable
/// bundling implementation; this command is the thin Cargo-facing wrapper.
///
/// # Errors
///
/// Returns an error when the release build fails, the TUI dependencies cannot be
/// installed, or the Bun packaging script exits non-zero.
pub fn run(repo_root: &Path) -> Result<(), String> {
    cargo::build_release_bin(repo_root, BACKEND_BIN)?;
    bun::ensure_tui_dependencies(repo_root)?;
    bun::run(repo_root, &["run", PACKAGE_SCRIPT])
}
