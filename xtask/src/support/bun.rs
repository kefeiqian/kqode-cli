use std::{path::Path, process::Command};

use crate::support::paths;

pub fn run(repo_root: &Path, args: &[&str]) -> Result<(), String> {
    run_in(&paths::tui_package_root(repo_root), args)
}

pub fn run_in(package_root: &Path, args: &[&str]) -> Result<(), String> {
    let status = Command::new(command())
        .args(args)
        .current_dir(package_root)
        .status()
        .map_err(|error| {
            format!(
                "run bun {} in {}: {error}",
                args.join(" "),
                package_root.display()
            )
        })?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("bun {} exited with {status}", args.join(" ")))
    }
}

/// Installs or updates the nested TUI dependencies before running a TUI command.
///
/// This deliberately runs `bun install` even when `node_modules` already exists
/// so new package manifest entries are picked up before the command starts.
///
/// # Errors
///
/// Returns an error when Bun cannot be started or `bun install` exits
/// unsuccessfully.
pub fn ensure_tui_dependencies(repo_root: &Path) -> Result<(), String> {
    println!("Ensuring TUI dependencies with bun install.");
    run(repo_root, &["install"])
}

pub fn command() -> &'static str {
    if cfg!(windows) { "bun.exe" } else { "bun" }
}
