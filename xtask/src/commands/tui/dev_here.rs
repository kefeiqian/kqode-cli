use std::{env, path::Path};

use crate::commands::tui::dev;

/// Runs the source TUI against the terminal's current working directory.
///
/// This is the development equivalent of launching the packaged `kqode`
/// executable from a project directory: dependencies and source files still come
/// from the KQode checkout, but the TUI and backend see the caller's cwd as the
/// workspace.
///
/// # Errors
///
/// Returns an error when the current directory cannot be resolved or the source
/// TUI launch fails.
pub fn run(repo_root: &Path) -> Result<(), String> {
    let workspace =
        env::current_dir().map_err(|error| format!("resolve current directory: {error}"))?;
    println!(
        "using current directory as TUI workspace: {}",
        workspace.display()
    );
    dev::run_with_workspace(repo_root, &workspace)
}
