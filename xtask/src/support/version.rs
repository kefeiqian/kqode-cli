use std::path::Path;

use crate::support::cargo;

/// Cargo manifests carrying the product version, bumped together by `set-version`.
const TOML_MANIFESTS: &[&str] = &["Cargo.toml"];

/// Local workspace dependencies whose exact requirement must match the product version.
const LOCAL_DEPENDENCIES: &[(&str, &str)] = &[
    ("crates/kqode-cli/Cargo.toml", "kqode-core"),
    ("crates/kqode-desktop/Cargo.toml", "kqode-core"),
    ("crates/kqode-desktop/Cargo.toml", "kqode-provider"),
    ("crates/kqode-provider/Cargo.toml", "kqode-core"),
];

/// JSON manifests carrying the product version as a top-level field.
const JSON_MANIFESTS: &[&str] = &[
    "crates/kqode-desktop/frontend/package.json",
    "crates/kqode-desktop/tauri.conf.json",
];

/// Validates `version`, writes it into every product manifest, then refreshes
/// `Cargo.lock` so the workspace members' locked versions match.
///
/// Root `Cargo.toml` owns the workspace product version inherited by every Rust
/// package, so local dependency requirements and desktop manifests are kept in
/// lockstep with the release tag `v<version>`.
///
/// # Errors
///
/// Returns an error when `version` is not `MAJOR.MINOR.PATCH`, a manifest is
/// missing its version field, a file cannot be read/written, or the lockfile
/// refresh fails.
pub fn set_all(repo_root: &Path, version: &str) -> Result<(), String> {
    validate(version)?;

    for rel in TOML_MANIFESTS {
        rewrite(repo_root, rel, version, set_toml_version)?;
    }
    for (rel, dependency) in LOCAL_DEPENDENCIES {
        rewrite(repo_root, rel, version, |contents, version| {
            set_toml_dependency_version(contents, dependency, version)
        })?;
    }
    for rel in JSON_MANIFESTS {
        rewrite(repo_root, rel, version, set_json_version)?;
    }
    cargo::update_workspace_lock(repo_root)?;
    println!("refreshed Cargo.lock");
    Ok(())
}

fn rewrite<F>(repo_root: &Path, rel: &str, version: &str, set: F) -> Result<(), String>
where
    F: Fn(&str, &str) -> Result<String, String>,
{
    let path = repo_root.join(rel);
    let original =
        std::fs::read_to_string(&path).map_err(|error| format!("read {rel}: {error}"))?;
    let updated = set(&original, version).map_err(|error| format!("{rel}: {error}"))?;
    std::fs::write(&path, updated).map_err(|error| format!("write {rel}: {error}"))?;
    println!("set {rel} -> {version}");
    Ok(())
}

/// Rejects anything that is not `MAJOR.MINOR.PATCH`, allowing a pre-release/build suffix.
fn validate(version: &str) -> Result<(), String> {
    let core = version.split(['-', '+']).next().unwrap_or_default();
    let parts: Vec<&str> = core.split('.').collect();
    let numeric = parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()));
    if numeric {
        Ok(())
    } else {
        Err(format!("`{version}` is not a MAJOR.MINOR.PATCH version"))
    }
}

/// Replaces the top-level `version = "..."` line of a Cargo manifest.
fn set_toml_version(contents: &str, version: &str) -> Result<String, String> {
    let mut replaced = false;
    let lines = contents
        .lines()
        .map(|line| {
            if !replaced && is_toml_version_line(line) {
                replaced = true;
                format!("version = \"{version}\"")
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>();

    if replaced {
        Ok(rejoin(contents, &lines))
    } else {
        Err("no top-level `version = \"...\"` found".to_string())
    }
}

/// A `version =` assignment at column 0 (the `[package]` version, not a dependency's inline version).
fn is_toml_version_line(line: &str) -> bool {
    line.strip_prefix("version")
        .is_some_and(|rest| rest.trim_start().starts_with('='))
}

/// Replaces an exact inline dependency version while preserving the path.
fn set_toml_dependency_version(
    contents: &str,
    dependency: &str,
    version: &str,
) -> Result<String, String> {
    let prefix = format!("{dependency} =");
    let needle = "version = \"=";
    let mut replaced = false;
    let lines = contents
        .lines()
        .map(|line| {
            if !line.trim_start().starts_with(&prefix) {
                return Ok(line.to_string());
            }
            let start = line
                .find(needle)
                .map(|index| index + needle.len())
                .ok_or_else(|| format!("`{dependency}` has no exact inline version"))?;
            let end = line[start..]
                .find('"')
                .map(|index| start + index)
                .ok_or_else(|| format!("`{dependency}` has an unterminated inline version"))?;
            replaced = true;
            Ok(format!("{}{}{}", &line[..start], version, &line[end..]))
        })
        .collect::<Result<Vec<_>, String>>()?;

    if replaced {
        Ok(rejoin(contents, &lines))
    } else {
        Err(format!("no `{dependency}` dependency found"))
    }
}

/// Replaces the first top-level `"version": "..."` of a package.json.
fn set_json_version(contents: &str, version: &str) -> Result<String, String> {
    let mut replaced = false;
    let lines = contents
        .lines()
        .map(|line| {
            if !replaced && line.trim_start().starts_with("\"version\"") {
                replaced = true;
                replace_json_value(line, version)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>();

    if replaced {
        Ok(rejoin(contents, &lines))
    } else {
        Err("no top-level `\"version\": \"...\"` found".to_string())
    }
}

/// Rewrites the quoted value after the first colon, preserving indentation and trailing comma.
fn replace_json_value(line: &str, version: &str) -> String {
    let Some(colon) = line.find(':') else {
        return line.to_string();
    };
    let (head, tail) = line.split_at(colon + 1);
    let Some(open) = tail.find('"') else {
        return line.to_string();
    };
    let after_open = &tail[open + 1..];
    let Some(close) = after_open.find('"') else {
        return line.to_string();
    };
    let leading = &tail[..open];
    let trailing = &after_open[close + 1..];
    format!("{head}{leading}\"{version}\"{trailing}")
}

/// Rejoins edited lines, preserving the original line ending and trailing newline.
fn rejoin(original: &str, lines: &[String]) -> String {
    let sep = if original.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut result = lines.join(sep);
    if original.ends_with('\n') {
        result.push_str(sep);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_the_workspace_version_source() {
        assert_eq!(TOML_MANIFESTS, ["Cargo.toml"]);
    }

    #[test]
    fn updates_all_versioned_local_dependencies() {
        assert_eq!(
            LOCAL_DEPENDENCIES,
            [
                ("crates/kqode-cli/Cargo.toml", "kqode-core"),
                ("crates/kqode-desktop/Cargo.toml", "kqode-core"),
                ("crates/kqode-desktop/Cargo.toml", "kqode-provider"),
                ("crates/kqode-provider/Cargo.toml", "kqode-core"),
            ]
        );
    }

    #[test]
    fn validate_accepts_semver_and_rejects_others() {
        for good in ["0.1.0", "1.2.3", "10.0.0", "0.2.0-rc.1", "1.0.0+build"] {
            assert!(validate(good).is_ok(), "{good} should be valid");
        }
        for bad in ["1.0", "1.0.0.0", "1.0.x", "abc", "", "v1.0.0"] {
            assert!(validate(bad).is_err(), "{bad} should be invalid");
        }
    }

    #[test]
    fn set_toml_version_only_touches_the_package_version() {
        let input = "[workspace.package]\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[workspace.dependencies]\nserde = { version = \"1\", features = [\"derive\"] }\n";
        let output = set_toml_version(input, "0.2.0").unwrap();
        assert!(output.contains("version = \"0.2.0\""));
        assert!(output.contains("serde = { version = \"1\""));
        assert!(!output.contains("version = \"0.1.0\""));
    }

    #[test]
    fn set_toml_version_errors_without_a_version() {
        assert!(set_toml_version("[package]\nname = \"x\"\n", "0.2.0").is_err());
    }

    #[test]
    fn set_toml_dependency_version_preserves_the_path() {
        let input = concat!(
            "[dependencies]\n",
            "kqode-core = { version = \"=0.1.3\", path = \"../kqode-core\" }\n",
            "serde = \"1\"\n",
            "\n[dev-dependencies]\n",
            "kqode-core = { version = \"=0.1.3\", path = \"../kqode-core\" }\n",
        );
        let output = set_toml_dependency_version(input, "kqode-core", "0.2.0").unwrap();
        assert_eq!(
            output,
            concat!(
                "[dependencies]\n",
                "kqode-core = { version = \"=0.2.0\", path = \"../kqode-core\" }\n",
                "serde = \"1\"\n",
                "\n[dev-dependencies]\n",
                "kqode-core = { version = \"=0.2.0\", path = \"../kqode-core\" }\n",
            )
        );
    }

    #[test]
    fn set_json_version_preserves_indent_and_comma() {
        let input = "{\n  \"name\": \"@kqode/desktop\",\n  \"version\": \"0.1.0\",\n  \"private\": true\n}\n";
        let output = set_json_version(input, "0.2.0").unwrap();
        assert!(output.contains("  \"version\": \"0.2.0\","));
        assert!(output.contains("  \"name\": \"@kqode/desktop\","));
        assert!(output.ends_with("}\n"));
    }

    #[test]
    fn rejoin_preserves_crlf() {
        let input = "a\r\nversion = \"0.1.0\"\r\n";
        let output = set_toml_version(input, "0.2.0").unwrap();
        assert!(output.contains("\r\n"));
        assert!(output.ends_with("\r\n"));
    }
}
