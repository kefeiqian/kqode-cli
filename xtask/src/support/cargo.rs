use std::{path::Path, process::Command};

/// Returns package names in the normal dependency tree for `package`.
///
/// # Errors
///
/// Returns an error when Cargo cannot be started, the package is unknown, or
/// dependency metadata cannot be decoded as UTF-8.
pub fn dependency_names(repo_root: &Path, package: &str) -> Result<Vec<String>, String> {
    let output = Command::new(command())
        .args([
            "tree",
            "-p",
            package,
            "--edges",
            "normal,build",
            "--all-features",
            "--target",
            "all",
            "--prefix",
            "none",
            "--format",
            "{p}",
        ])
        .current_dir(repo_root)
        .output()
        .map_err(|error| format!("run cargo tree for {package}: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "cargo tree for {package} exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("decode cargo tree output for {package}: {error}"))?;
    Ok(parse_dependency_names(&stdout))
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

fn parse_dependency_names(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::parse_dependency_names;

    #[test]
    fn parses_package_names_from_cargo_tree_output() {
        assert_eq!(
            parse_dependency_names("kqode-core v0.1.3\nserde v1.0.228\nserde_core v1.0.228 (*)\n"),
            ["kqode-core", "serde", "serde_core"]
        );
    }
}
