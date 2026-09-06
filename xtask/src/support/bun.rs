use std::{path::Path, process::Command};

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

pub fn command() -> &'static str {
    if cfg!(windows) { "bun.exe" } else { "bun" }
}
