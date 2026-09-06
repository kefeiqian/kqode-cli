use std::path::Path;

pub mod blog;
pub mod desktop;
pub mod help;
pub mod set_version;
pub mod workspace_boundaries;

/// Metadata and executable entrypoint for one xtask command.
#[derive(Clone, Copy)]
pub struct CommandSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub run: fn(&Path) -> Result<(), String>,
}

const HELP_COMMANDS: &[CommandSpec] = &[help::COMMAND];
const PACKAGE_COMMANDS: &[CommandSpec] = &[workspace_boundaries::COMMAND, set_version::COMMAND];
const COMMAND_GROUPS: &[&[CommandSpec]] = &[
    desktop::COMMANDS,
    blog::COMMANDS,
    PACKAGE_COMMANDS,
    HELP_COMMANDS,
];

pub fn run(command: Option<&str>, repo_root: &Path) -> Result<(), String> {
    let command = command.unwrap_or(help::COMMAND.name);

    if let Some(spec) = all_commands().find(|spec| spec.name == command) {
        (spec.run)(repo_root)
    } else {
        Err(format!(
            "unknown command `{command}`. Run `cargo xtask help`."
        ))
    }
}

/// Returns every registered command in the same order shown by `cargo xtask help`.
pub fn all_commands() -> impl Iterator<Item = &'static CommandSpec> {
    COMMAND_GROUPS.iter().flat_map(|group| group.iter())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn command_names_are_unique() {
        let mut names = HashSet::new();

        for command in all_commands() {
            assert!(
                names.insert(command.name),
                "duplicate xtask command: {}",
                command.name
            );
        }
    }
}
