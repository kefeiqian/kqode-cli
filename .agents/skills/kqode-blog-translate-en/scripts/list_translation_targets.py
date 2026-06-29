#!/usr/bin/env python3
"""List Chinese Docusaurus docs and their English locale targets."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def repo_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "blog" / "docs").is_dir():
            return candidate
    raise SystemExit("Run this script from inside the KQode repository.")


def iter_docs(docs_root: Path) -> list[Path]:
    ignored_parts = {"images"}
    docs = []
    for path in docs_root.rglob("*.md"):
        relative = path.relative_to(docs_root)
        if any(part in ignored_parts for part in relative.parts):
            continue
        docs.append(path)
    return sorted(docs, key=lambda item: item.relative_to(docs_root).as_posix())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Only print docs whose English target does not exist.",
    )
    args = parser.parse_args()

    root = repo_root()
    docs_root = root / "blog" / "docs"
    en_root = root / "blog" / "i18n" / "en" / "docusaurus-plugin-content-docs" / "current"

    for source in iter_docs(docs_root):
        relative = source.relative_to(docs_root)
        target = en_root / relative
        status = "exists" if target.exists() else "missing"
        if args.missing_only and status == "exists":
            continue
        print(f"{status}\t{source.relative_to(root)}\t{target.relative_to(root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
