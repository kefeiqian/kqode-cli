#!/usr/bin/env python3
"""Reconnaissance helper for KQode milestone dev-diary blog articles.

Given a single tag/commit (a "U-milestone") or a range (a version release),
prints the ground-truth facts a writer needs before quoting any code:
the commit SHA(s), subject(s), the real parent, the diff --stat, and the
files touched. It never invents anything; it only reports what git shows.

Usage (run from the repository root):

    # Single U-milestone: one tagged commit, diff vs its real parent.
    python .agents/skills/kqode-blog-milestone-diary/scripts/milestone_recon.py U5

    # Version release: every commit between two release tags.
    python .agents/skills/kqode-blog-milestone-diary/scripts/milestone_recon.py v0.1.1..v0.1.2

Read-only: this script only runs `git rev-parse`, `git log`, `git show`,
`git diff`, and `git tag`. It never mutates the working tree or index.
"""

from __future__ import annotations

import subprocess
import sys


def git(*args: str) -> str:
    """Run a read-only git command and return trimmed stdout."""
    result = subprocess.run(
        ["git", "--no-pager", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        raise SystemExit(f"git {' '.join(args)} failed (exit {result.returncode})")
    return result.stdout.rstrip("\n")


def section(title: str) -> None:
    print()
    print(f"=== {title} ===")


def report_single(ref: str) -> None:
    """Report a single tagged commit and its diff versus its real parent."""
    sha = git("rev-parse", "--short", ref)
    full = git("rev-parse", ref)
    subject = git("log", "-1", "--format=%s", ref)
    parent = git("rev-parse", "--short", f"{ref}^")
    parent_tags = git("tag", "--points-at", f"{ref}^") or "(none - parent is an untagged commit)"

    section(f"MILESTONE {ref}")
    print(f"commit        : {sha}  ({full})")
    print(f"subject       : {subject}")
    print(f"parent commit : {parent}")
    print(f"tags at parent: {parent_tags}")
    print()
    print("Permalink base for this milestone (pin every source link to this SHA):")
    print(f"  https://github.com/kefeiqian/KQode/blob/{full}/<path>")
    print(f"  https://github.com/kefeiqian/KQode/commit/{full}")

    print()
    print(f"!! Tag numbering is NOT commit order. Document exactly `git show {ref}`")
    print(f"   (this one commit's diff vs {parent}). Do NOT document "
          "`<previousTag>..<thisTag>` -")
    print("   that range can reach back through other tagged milestones.")

    section(f"git show --stat {ref}  (the files THIS milestone introduced)")
    print(git("show", "--stat", "--oneline", ref))

    section("Local history (the immediate parent is the line directly below the "
            "milestone; untagged parents are shown)")
    print(git("log", "--graph", "--oneline", "--decorate", "-8", ref))


def report_range(rng: str) -> None:
    """Report every commit in a version range plus the aggregate diff --stat."""
    base, _, head = rng.partition("..")
    base = base.strip()
    head = head.strip() or "HEAD"

    base_full = git("rev-parse", base)
    head_full = git("rev-parse", head)

    section(f"VERSION RANGE {base}..{head}")
    print(f"base: {git('rev-parse', '--short', base)}  ({base_full})")
    print(f"head: {git('rev-parse', '--short', head)}  ({head_full})")
    print()
    print("Write one article per substantive commit below (skip trivial release")
    print("chores, but mention them in the overview).")
    print("Pin each article's source links to the SHA of the commit it documents.")

    section(f"commits in {base}..{head}  (newest first)")
    print(git("log", "--oneline", f"{base}..{head}"))

    section(f"git diff --stat {base} {head}  (aggregate change)")
    print(git("diff", "--stat", base, head))


def main() -> None:
    if len(sys.argv) != 2:
        sys.stderr.write(
            "usage: milestone_recon.py <tag|commit>            # single U-milestone\n"
            "       milestone_recon.py <baseTag>..<headTag>    # version range\n"
        )
        raise SystemExit(2)

    ref = sys.argv[1]
    if ".." in ref:
        report_range(ref)
    else:
        report_single(ref)


if __name__ == "__main__":
    main()
