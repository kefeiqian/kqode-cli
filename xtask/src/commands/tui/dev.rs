use std::{
    io::{self, Write},
    path::Path,
    process::Command,
};

use crate::{
    commands::{CommandSpec, fixture},
    support::{bun, paths},
};

pub fn run(repo_root: &Path) -> Result<(), String> {
    ensure_workspace(repo_root)?;
    bun::ensure_tui_dependencies(repo_root)?;

    let workspace = paths::workspace(repo_root);
    let status = Command::new(paths::tui_bin(repo_root, "tsx"))
        .arg("--tsconfig")
        .arg(paths::tui_tsconfig(repo_root))
        .arg(paths::tui_entrypoint(repo_root))
        .current_dir(&workspace)
        .status()
        .map_err(|error| format!("run TUI dev command: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("TUI dev command exited with {status}"))
    }
}

/// Ensures `tui-dev` has a runnable workspace without overwriting an existing one.
///
/// An existing workspace must look runnable enough for the TUI cwd smoke path
/// by containing a `package.json`. Missing workspaces are created by prompting
/// for one of the registered fixture commands.
///
/// # Errors
///
/// Returns an error when the existing workspace is incomplete, the fixture
/// selection cannot be read, or the selected fixture command fails.
pub(crate) fn ensure_workspace(repo_root: &Path) -> Result<(), String> {
    let workspace = paths::workspace(repo_root);

    if workspace.is_dir() {
        ensure_workspace_ready(&workspace)
    } else {
        prepare_selected_fixture(repo_root)
    }
}

fn ensure_workspace_ready(workspace: &Path) -> Result<(), String> {
    let package_json = workspace.join("package.json");

    if package_json.is_file() {
        println!("using existing workspace at {}", workspace.display());
        Ok(())
    } else {
        Err(format!(
            "workspace exists but is missing package.json: {}. Run a fixture prepare command to reset it.",
            package_json.display()
        ))
    }
}

/// Chooses from the registered fixture commands instead of keeping a separate picker list.
///
/// Users may select a fixture by its 1-based position, short label such as
/// `react-simple`, or full command name such as `fixture-prepare-react-simple`.
///
/// # Errors
///
/// Returns an error when stdin cannot be read, stdout cannot be flushed, the
/// selection is unknown, or the selected fixture command fails.
fn prepare_selected_fixture(repo_root: &Path) -> Result<(), String> {
    println!("workspace is missing. Choose a fixture to prepare:");
    for (index, command) in fixture::COMMANDS.iter().enumerate() {
        println!(
            "  {}) {} - {}",
            index + 1,
            fixture_label(command.name),
            command.description
        );
    }
    print!("Select fixture: ");
    io::stdout()
        .flush()
        .map_err(|error| format!("flush fixture prompt: {error}"))?;

    let mut selection = String::new();
    io::stdin()
        .read_line(&mut selection)
        .map_err(|error| format!("read fixture selection: {error}"))?;

    if let Some(command) = resolve_fixture(selection.trim()) {
        (command.run)(repo_root)
    } else {
        Err(format!(
            "unknown fixture selection `{}`. Choose one of the listed fixtures.",
            selection.trim()
        ))
    }
}

fn resolve_fixture(selection: &str) -> Option<&'static CommandSpec> {
    fixture::COMMANDS
        .iter()
        .enumerate()
        .find(|(index, command)| {
            selection == (index + 1).to_string()
                || selection == command.name
                || selection == fixture_label(command.name)
        })
        .map(|(_index, command)| command)
}

fn fixture_label(command_name: &str) -> &str {
    command_name
        .strip_prefix("fixture-prepare-")
        .unwrap_or(command_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_fixture_by_number_label_or_command_name() {
        assert_eq!(
            resolve_fixture("1").map(|command| command.name),
            Some(fixture::PREPARE_REACT_SIMPLE.name)
        );
        assert_eq!(
            resolve_fixture("react-complex").map(|command| command.name),
            Some(fixture::PREPARE_REACT_COMPLEX.name)
        );
        assert_eq!(
            resolve_fixture("fixture-prepare-react-simple").map(|command| command.name),
            Some(fixture::PREPARE_REACT_SIMPLE.name)
        );
        assert!(resolve_fixture("python-simple").is_none());
    }
}
