use std::path::Path;

use crate::support::cargo;

/// Cargo manifests carrying the product version, bumped together by `set-version`.
const TOML_MANIFESTS: &[&str] = &["Cargo.toml", "xtask/Cargo.toml"];

/// npm package manifests carrying the product version as a single top-level field.
const JSON_MANIFESTS: &[&str] = &["tui/package.json"];

/// The launcher package, whose top-level version AND its `@kqode/kqode-cli-*`
/// optional-dependency pins must move together so npm resolves the matching
/// platform packages for the released version.
const NPM_MAIN_MANIFEST: &str = "packaging/npm/kqode/package.json";

/// Validates `version`, writes it into every product manifest, then refreshes
/// `Cargo.lock` so the workspace members' locked versions match.
///
/// Root `Cargo.toml` is the displayed product version and is baked into the
/// packaged executable, so all manifests are kept in lockstep and equal to the
/// release tag `v<version>`. The launcher package's `@kqode/kqode-cli-*`
/// optional-dependency pins are bumped alongside its own version so the platform
/// packages resolve at install time.
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
    for rel in JSON_MANIFESTS {
        rewrite(repo_root, rel, version, set_json_version)?;
    }
    rewrite(repo_root, NPM_MAIN_MANIFEST, version, set_npm_main_version)?;

    cargo::update_workspace_lock(repo_root)?;
    println!("refreshed Cargo.lock");
    Ok(())
}

fn rewrite(
    repo_root: &Path,
    rel: &str,
    version: &str,
    set: fn(&str, &str) -> Result<String, String>,
) -> Result<(), String> {
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

/// Sets the launcher package's top-level version and its platform dependency pins.
///
/// First bumps the top-level `"version"` (like every other JSON manifest), then
/// rewrites the pinned version of each `@kqode/kqode-cli-<platform>-<arch>`
/// optional dependency so the platform packages stay in lockstep.
fn set_npm_main_version(contents: &str, version: &str) -> Result<String, String> {
    let with_top_level = set_json_version(contents, version)?;
    Ok(set_platform_dependency_pins(&with_top_level, version))
}

/// Rewrites the pinned version of every `@kqode/kqode-cli-<platform>-<arch>`
/// optional-dependency line, leaving the package's own `"name"` untouched.
fn set_platform_dependency_pins(contents: &str, version: &str) -> String {
    let lines = contents
        .lines()
        .map(|line| {
            if is_platform_dependency_line(line) {
                replace_json_value(line, version)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>();
    rejoin(contents, &lines)
}

/// A `"@kqode/kqode-cli-...": "..."` dependency key (note the trailing hyphen,
/// which excludes the package's own `"@kqode/kqode-cli"` name).
fn is_platform_dependency_line(line: &str) -> bool {
    line.trim_start().starts_with("\"@kqode/kqode-cli-")
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
        let input = "[package]\nname = \"KQode\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[dependencies]\nserde = { version = \"1\", features = [\"derive\"] }\n";
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
    fn set_json_version_preserves_indent_and_comma() {
        let input =
            "{\n  \"name\": \"@kqode/kqode-cli\",\n  \"version\": \"0.1.0\",\n  \"bin\": {}\n}\n";
        let output = set_json_version(input, "0.2.0").unwrap();
        assert!(output.contains("  \"version\": \"0.2.0\","));
        assert!(output.contains("  \"name\": \"@kqode/kqode-cli\","));
        assert!(output.ends_with("}\n"));
    }

    #[test]
    fn set_npm_main_version_bumps_top_level_and_platform_pins() {
        let input = "{\n  \"name\": \"@kqode/kqode-cli\",\n  \"version\": \"0.1.2\",\n  \"homepage\": \"https://github.com/kefeiqian/kqode-cli\",\n  \"optionalDependencies\": {\n    \"@kqode/kqode-cli-linux-x64\": \"0.1.2\",\n    \"@kqode/kqode-cli-win32-x64\": \"0.1.2\"\n  }\n}\n";
        let output = set_npm_main_version(input, "0.2.0").unwrap();
        assert!(output.contains("\"version\": \"0.2.0\""));
        assert!(output.contains("\"@kqode/kqode-cli-linux-x64\": \"0.2.0\""));
        assert!(output.contains("\"@kqode/kqode-cli-win32-x64\": \"0.2.0\""));
        // The package's own name and homepage (which carry no version) are intact.
        assert!(output.contains("\"name\": \"@kqode/kqode-cli\","));
        assert!(output.contains("\"https://github.com/kefeiqian/kqode-cli\","));
        // No stale pin remains anywhere.
        assert!(!output.contains("0.1.2"));
    }

    #[test]
    fn platform_dependency_line_excludes_the_package_name() {
        assert!(is_platform_dependency_line(
            "    \"@kqode/kqode-cli-win32-x64\": \"0.1.2\","
        ));
        assert!(!is_platform_dependency_line(
            "  \"name\": \"@kqode/kqode-cli\","
        ));
        assert!(!is_platform_dependency_line(
            "  \"homepage\": \"https://github.com/kefeiqian/kqode-cli\","
        ));
    }

    #[test]
    fn rejoin_preserves_crlf() {
        let input = "a\r\nversion = \"0.1.0\"\r\n";
        let output = set_toml_version(input, "0.2.0").unwrap();
        assert!(output.contains("\r\n"));
        assert!(output.ends_with("\r\n"));
    }
}
