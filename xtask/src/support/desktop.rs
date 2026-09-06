use std::path::Path;

use crate::support::{bun, paths};

/// Starts the Tauri desktop application in development mode.
///
/// # Errors
///
/// Returns an error when dependencies cannot be installed or the Tauri
/// development command fails.
pub fn dev(repo_root: &Path) -> Result<(), String> {
    ensure_dependencies(repo_root)?;
    bun::run_in(
        &paths::desktop_frontend_root(repo_root),
        &["run", "tauri", "dev"],
    )
}

fn ensure_dependencies(repo_root: &Path) -> Result<(), String> {
    let tauri = paths::desktop_bin(repo_root, "tauri");

    if tauri.is_file() {
        Ok(())
    } else {
        println!("Desktop dependencies are missing; running bun install.");
        bun::run_in(&paths::desktop_frontend_root(repo_root), &["install"])
    }
}
