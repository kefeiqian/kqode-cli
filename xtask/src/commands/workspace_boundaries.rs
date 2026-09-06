use std::path::Path;

use crate::{commands::CommandSpec, support::cargo};

pub const COMMAND: CommandSpec = CommandSpec {
    name: "workspace-boundaries",
    description: "Check dependency boundaries between runtime, providers, CLI, and desktop",
    run,
};

struct Boundary {
    package: &'static str,
    forbidden_prefixes: &'static [&'static str],
}

const BOUNDARIES: &[Boundary] = &[
    Boundary {
        package: "kqode-core",
        forbidden_prefixes: &[
            "github-copilot-sdk",
            "kqode-cli",
            "kqode-desktop",
            "kqode-provider",
            "reqwest",
            "rusqlite",
            "tauri",
        ],
    },
    Boundary {
        package: "kqode-provider",
        forbidden_prefixes: &["kqode-cli", "kqode-desktop", "rusqlite", "tauri"],
    },
    Boundary {
        package: "kqode-cli",
        forbidden_prefixes: &["kqode-desktop", "rusqlite", "tauri"],
    },
];

/// Checks that lower-level workspace crates do not depend on forbidden layers.
///
/// # Errors
///
/// Returns an error when Cargo cannot inspect a package or a forbidden
/// dependency is present in its normal dependency tree.
pub fn run(repo_root: &Path) -> Result<(), String> {
    for boundary in BOUNDARIES {
        let dependencies = cargo::dependency_names(repo_root, boundary.package)?;
        let violations = find_violations(&dependencies, boundary.forbidden_prefixes);
        if !violations.is_empty() {
            return Err(format!(
                "{} has forbidden dependencies: {}",
                boundary.package,
                violations.join(", ")
            ));
        }
        println!("{} dependency boundary is valid", boundary.package);
    }
    Ok(())
}

fn find_violations(dependencies: &[String], forbidden_prefixes: &[&str]) -> Vec<String> {
    dependencies
        .iter()
        .filter(|dependency| {
            forbidden_prefixes.iter().any(|prefix| {
                dependency.as_str() == *prefix
                    || dependency
                        .strip_prefix(prefix)
                        .is_some_and(|suffix| suffix.starts_with('-'))
            })
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::find_violations;

    #[test]
    fn detects_exact_and_family_dependencies() {
        let dependencies = vec![
            "kqode-core".to_owned(),
            "kqode-cli".to_owned(),
            "serde".to_owned(),
            "tauri-utils".to_owned(),
            "rusqlite".to_owned(),
        ];

        assert_eq!(
            find_violations(&dependencies, &["kqode-cli", "tauri", "rusqlite"]),
            ["kqode-cli", "tauri-utils", "rusqlite"]
        );
    }
}
