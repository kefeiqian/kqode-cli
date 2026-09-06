#!/usr/bin/env python3
"""Synchronize Compound Engineering and resolve one of its skills."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


REPOSITORY_URL = "https://github.com/EveryInc/compound-engineering-plugin.git"
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
PLUGIN_ROOT = REPOSITORY_ROOT / ".kqode-dev" / "compound-engineering-plugin"
COMMAND_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class SyncError(RuntimeError):
    """Raised when the managed checkout cannot be synchronized safely."""


def run_git(*args: str, cwd: Path | None = None) -> str:
    """Run Git and return trimmed stdout."""
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise SyncError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout.strip()


def normalized_remote(url: str) -> str:
    """Normalize the expected GitHub HTTPS URL for comparison."""
    return url.strip().lower().removesuffix("/").removesuffix(".git")


def clone_or_validate() -> None:
    """Create the managed checkout or validate its origin."""
    detected_root = Path(
        run_git("rev-parse", "--show-toplevel", cwd=REPOSITORY_ROOT)
    ).resolve()
    if detected_root != REPOSITORY_ROOT:
        raise SyncError(
            f"skill is not located under its expected repository root: {REPOSITORY_ROOT}"
        )

    if not PLUGIN_ROOT.exists():
        PLUGIN_ROOT.parent.mkdir(parents=True, exist_ok=True)
        run_git("clone", REPOSITORY_URL, str(PLUGIN_ROOT))
        return

    if not (PLUGIN_ROOT / ".git").is_dir():
        raise SyncError(
            f"managed path exists but is not a Git checkout: {PLUGIN_ROOT}"
        )

    origin = run_git("remote", "get-url", "origin", cwd=PLUGIN_ROOT)
    if normalized_remote(origin) != normalized_remote(REPOSITORY_URL):
        raise SyncError(
            f"managed checkout has unexpected origin {origin!r}; "
            f"expected {REPOSITORY_URL!r}"
        )


def synchronize() -> tuple[str, bool]:
    """Fetch the default branch and reset stale or modified tracked state."""
    clone_or_validate()
    before = run_git("rev-parse", "HEAD", cwd=PLUGIN_ROOT)
    run_git("fetch", "--prune", "origin", cwd=PLUGIN_ROOT)

    try:
        remote_ref = run_git(
            "symbolic-ref", "refs/remotes/origin/HEAD", cwd=PLUGIN_ROOT
        )
    except SyncError:
        run_git("remote", "set-head", "origin", "--auto", cwd=PLUGIN_ROOT)
        remote_ref = run_git(
            "symbolic-ref", "refs/remotes/origin/HEAD", cwd=PLUGIN_ROOT
        )

    latest = run_git("rev-parse", remote_ref, cwd=PLUGIN_ROOT)
    tracked_dirty = bool(
        run_git("status", "--porcelain", "--untracked-files=no", cwd=PLUGIN_ROOT)
    )
    updated = before != latest or tracked_dirty
    if updated:
        run_git("reset", "--hard", remote_ref, cwd=PLUGIN_ROOT)

    current = run_git("rev-parse", "HEAD", cwd=PLUGIN_ROOT)
    if current != latest:
        raise SyncError(
            f"checkout did not reach remote commit {latest}; current commit is {current}"
        )
    return current, updated


def available_commands() -> list[str]:
    """Return public command names from the synchronized plugin."""
    skills_root = PLUGIN_ROOT / "skills"
    commands: list[str] = []
    for skill_file in sorted(skills_root.glob("*/SKILL.md")):
        name = skill_file.parent.name
        commands.append(name[3:] if name.startswith("ce-") else name)
    return commands


def resolve_skill(command: str) -> Path:
    """Map a short command name to a public upstream skill entrypoint."""
    if not COMMAND_PATTERN.fullmatch(command):
        raise SyncError(
            "subcommand must contain only lowercase letters, digits, and hyphens"
        )

    skill_name = (
        command
        if command == "lfg" or command.startswith("ce-")
        else f"ce-{command}"
    )
    skill_file = (PLUGIN_ROOT / "skills" / skill_name / "SKILL.md").resolve()
    skills_root = (PLUGIN_ROOT / "skills").resolve()
    if skills_root not in skill_file.parents or not skill_file.is_file():
        choices = ", ".join(available_commands())
        raise SyncError(
            f"unknown Compound Engineering command {command!r}. Available: {choices}"
        )
    return skill_file


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Synchronize and resolve a Compound Engineering skill."
    )
    parser.add_argument("command", nargs="?")
    parser.add_argument(
        "--list", action="store_true", help="list available short command names"
    )
    args = parser.parse_args()

    try:
        revision, updated = synchronize()
        if args.list:
            print(
                json.dumps(
                    {
                        "repository_root": str(REPOSITORY_ROOT),
                        "plugin_root": str(PLUGIN_ROOT.resolve()),
                        "revision": revision,
                        "updated": updated,
                        "commands": available_commands(),
                    }
                )
            )
            return 0
        if not args.command:
            parser.error("command is required unless --list is used")

        skill_file = resolve_skill(args.command)
        print(
            json.dumps(
                {
                    "repository_root": str(REPOSITORY_ROOT),
                    "plugin_root": str(PLUGIN_ROOT.resolve()),
                    "revision": revision,
                    "updated": updated,
                    "command": args.command,
                    "skill_file": str(skill_file),
                }
            )
        )
        return 0
    except SyncError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
