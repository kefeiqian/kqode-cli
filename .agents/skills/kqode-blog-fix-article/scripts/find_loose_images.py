#!/usr/bin/env python3
"""Report loose images referenced by (or adjacent to) one KQode blog doc.

Finds standard Markdown images and Obsidian ``![[...]]`` embeds that are not yet
under ``blog/docs/images/``, resolves their real source files with size + mtime,
and prints the correct relative image prefix for the doc's nesting depth.

Read-only: never moves, renames, or edits anything. The agent views the
candidates and decides which to keep (e.g. "use the latest" == newest mtime).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

MD_IMAGE = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<target>[^)]+)\)")
WIKI_IMAGE = re.compile(r"!\[\[(?P<name>[^\]\|]+)(?:\|[^\]]*)?\]\]")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}
PRUNE_DIRS = {".git", "node_modules", "target", "build", "dist", ".docusaurus", ".next"}
LOOSE_HINTS = ("pasted image", "screenshot", "screen shot")


def repo_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "blog" / "docs").is_dir():
            return candidate
    raise SystemExit("Run this script from inside the KQode repository.")


def describe(path: Path) -> str:
    st = path.stat()
    mtime = datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    return f"{st.st_size} bytes  mtime={mtime}"


def build_index(root: Path) -> dict[str, list[Path]]:
    """Map lowercase image basename -> paths, skipping heavy build dirs."""
    index: dict[str, list[Path]] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in PRUNE_DIRS]
        for name in filenames:
            if Path(name).suffix.lower() in IMAGE_EXTS:
                index.setdefault(name.lower(), []).append(Path(dirpath) / name)
    return index


def parse_md_target(raw: str) -> str:
    target = raw.strip()
    if target.startswith("<") and ">" in target:
        return unquote(target[1: target.index(">")])
    for ext in sorted(IMAGE_EXTS, key=len, reverse=True):
        match = re.search(rf"{re.escape(ext)}(?=\s|$)", target, flags=re.IGNORECASE)
        if match:
            return unquote(target[: match.end()])
    return unquote(target.split()[0]) if target else target


def is_under_images(target: str) -> bool:
    return "images/" in target.lower().replace("\\", "/").removeprefix("./")


def is_remote(target: str) -> bool:
    low = target.lower()
    return "://" in low or low.startswith(("#", "mailto:"))


def newest_first(paths: list[Path]) -> list[Path]:
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("doc", help="Path to a Markdown doc under blog/docs")
    args = parser.parse_args()

    root = repo_root()
    docs_root = root / "blog" / "docs"
    doc = Path(args.doc).resolve()
    if not doc.is_file():
        raise SystemExit(f"Doc does not exist: {doc}")
    if not doc.is_relative_to(docs_root):
        raise SystemExit(f"Doc must be under {docs_root}")

    content = doc.read_text(encoding="utf-8")
    index = build_index(root)
    prefix = Path(os.path.relpath(docs_root / "images", doc.parent)).as_posix()

    print(f"# doc: {doc.relative_to(root).as_posix()}")
    print(f"# move loose images to blog/docs/images/<slug>/ and link them as: {prefix}/<slug>/<file>")
    print()

    loose = 0

    print("## Obsidian ![[...]] embeds (invalid in Docusaurus; must convert)")
    wiki = list(WIKI_IMAGE.finditer(content))
    if not wiki:
        print("  (none)")
    for match in wiki:
        loose += 1
        name = match.group("name").strip()
        base = Path(name.replace("\\", "/")).name
        print(f"- ![[{name}]]")
        matches = index.get(base.lower(), [])
        if not matches:
            print(f"    ! no source file named '{base}' found (excluding {sorted(PRUNE_DIRS)})")
        for p in newest_first(matches):
            print(f"    candidate: {p.relative_to(root).as_posix()}  ({describe(p)})")
    print()

    print("## Markdown ![](...) images not yet under images/")
    md_loose = []
    for match in MD_IMAGE.finditer(content):
        target = parse_md_target(match.group("target"))
        if is_remote(target) or is_under_images(target):
            continue
        if Path(target).suffix.lower() not in IMAGE_EXTS:
            continue
        md_loose.append((match.group("alt"), target))
    if not md_loose:
        print("  (none)")
    for alt, target in md_loose:
        loose += 1
        src = (doc.parent / target).resolve()
        status = describe(src) if src.is_file() else "MISSING"
        print(f"- ![{alt}]({target})  -> {status}")
    print()

    print("## Unreferenced loose paste candidates (repo root + blog/docs top level)")
    found_any = False
    seen: set[Path] = set()
    for scan_dir in (root, docs_root):
        for p in sorted(scan_dir.glob("*")):
            if not (p.is_file() and p.suffix.lower() in IMAGE_EXTS) or p in seen:
                continue
            low = p.name.lower()
            if any(hint in low for hint in LOOSE_HINTS) or low.startswith("img"):
                seen.add(p)
                found_any = True
                print(f"- {p.relative_to(root).as_posix()}  ({describe(p)})")
    if not found_any:
        print("  (none)")
    print()

    print(f"# total referenced loose images: {loose}")
    if loose == 0 and not found_any:
        print("# clean: nothing to migrate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
