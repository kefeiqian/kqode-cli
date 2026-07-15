use std::{path::Path, process::Command};

/// Build variable and value that compile the packaged backend under the
/// `__PROD__` cfg. Mirrors `KQODE_ENV` in the TUI packaging define.
const BUILD_ENV_VAR: &str = "KQODE_ENV";
const PROD_ENV: &str = "prod";

/// Builds a Cargo binary target in release mode from the repository root.
///
/// Used by the packaging command to produce the backend that gets embedded into
/// the standalone executable. The build runs from the trusted `repo_root` so the
/// manifest and `.cargo` config come from the repository, not a workspace, and
/// sets `KQODE_ENV=prod` so the backend compiles under the `__PROD__` cfg —
/// matching the packaged TUI's prod build.
///
/// # Errors
///
/// Returns an error when Cargo cannot be started or the build exits non-zero.
pub fn build_release_bin(repo_root: &Path, bin: &str) -> Result<(), String> {
    let status = Command::new(command())
        .args(["build", "--release", "--bin", bin])
        .env(BUILD_ENV_VAR, PROD_ENV)
        .current_dir(repo_root)
        .status()
        .map_err(|error| format!("run cargo build --release --bin {bin}: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "cargo build --release --bin {bin} exited with {status}"
        ))
    }
}

/// Refreshes `Cargo.lock` so workspace members' locked versions match their
/// manifests, without upgrading external dependencies.
///
/// # Errors
///
/// Returns an error when Cargo cannot be started or the command exits non-zero.
pub fn update_workspace_lock(repo_root: &Path) -> Result<(), String> {
    let status = Command::new(command())
        .args(["update", "--workspace"])
        .current_dir(repo_root)
        .status()
        .map_err(|error| format!("run cargo update --workspace: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("cargo update --workspace exited with {status}"))
    }
}

fn command() -> &'static str {
    if cfg!(windows) { "cargo.exe" } else { "cargo" }
}
