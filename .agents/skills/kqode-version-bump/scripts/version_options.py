#!/usr/bin/env python3
"""Report the current KQode product version and the major/minor/patch bump candidates.

Reads the top-level `version = "..."` from the repository root `Cargo.toml`
(the single source of truth that `cargo xtask set-version` writes to every
manifest) and prints the current version plus the three semantic-version bump
candidates as JSON, so the version-bump skill never has to parse the manifest or
do arithmetic itself.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Mirrors `is_toml_version_line` in xtask/src/support/version.rs: a `version =`
# assignment at column 0, i.e. the [package] version, not a dependency's inline
# version.
TOP_LEVEL_VERSION = re.compile(r'^version\s*=\s*"([^"]+)"', re.MULTILINE)
SEMVER_CORE = re.compile(r"^(\d+)\.(\d+)\.(\d+)")


def repo_root() -> Path:
    current = Path(__file__).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "Cargo.toml").is_file():
            return candidate
    raise SystemExit("error: could not locate the repository root (no .git + Cargo.toml)")


def read_current_version(root: Path) -> str:
    manifest = (root / "Cargo.toml").read_text(encoding="utf-8")
    match = TOP_LEVEL_VERSION.search(manifest)
    if match is None:
        raise SystemExit("error: no top-level `version = \"...\"` in Cargo.toml")
    return match.group(1)


def bump_candidates(version: str) -> dict[str, str]:
    match = SEMVER_CORE.match(version)
    if match is None:
        raise SystemExit(f"error: `{version}` is not a MAJOR.MINOR.PATCH version")
    major, minor, patch = (int(part) for part in match.groups())
    return {
        "major": f"{major + 1}.0.0",
        "minor": f"{major}.{minor + 1}.0",
        "patch": f"{major}.{minor}.{patch + 1}",
    }


def main() -> int:
    current = read_current_version(repo_root())
    payload = {"current": current, **bump_candidates(current)}
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
