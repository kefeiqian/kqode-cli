use std::{path::Path, process::Command};

use crate::{
    commands::{package, tui::dev},
    support::paths,
};

/// Packages the standalone `kqode` executable, then runs it from the workspace.
///
/// Unlike `tui-dev`, which runs the TypeScript source through `tsx`, this
/// exercises the production launch path: the self-contained Bun-compiled
/// executable with the embedded Rust backend. The workspace selection mirrors
/// `tui-dev` so the packaged binary runs against a real project `cwd`, and the
/// fixture prompt (when the workspace is missing) happens before the longer
/// packaging build rather than after it.
///
/// # Errors
///
/// Returns an error when the workspace cannot be prepared, packaging fails, the
/// built executable is missing, or it exits non-zero.
pub fn run(repo_root: &Path) -> Result<(), String> {
    let workspace = dev::ensure_workspace(repo_root)?;
    package::run(repo_root)?;

    let exe = paths::tui_packaged_exe(repo_root);
    if !exe.is_file() {
        return Err(format!(
            "packaged executable not found at {}; packaging did not produce it",
            exe.display()
        ));
    }

    let status = Command::new(&exe)
        .current_dir(&workspace)
        .status()
        .map_err(|error| format!("run packaged executable {}: {error}", exe.display()))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("packaged executable exited with {status}"))
    }
}
