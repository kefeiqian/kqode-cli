#!/usr/bin/env python3
"""Report English words used in KQode blog prose, minus what the glossary covers.

Given one or more docs (files or directories under ``blog/docs``), this lists the
English tokens that appear in *prose* -- excluding fenced/inline code, link and
image URLs, HTML tags, and frontmatter -- and marks which are already defined in
the glossary category (``blog/docs/附录A-术语表/``).

Read-only: it never edits anything. The agent curates the NEW candidates, decides
domain-term vs. common-word, and (for common words) explains why English is kept.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter
from pathlib import Path

GLOSSARY_DIR_DEFAULT = "blog/docs/附录A-术语表"
PRUNE_DIRS = {".git", "node_modules", "target", "build", "dist", ".docusaurus", ".next"}

FRONTMATTER = re.compile(r"^\ufeff?---\n.*?\n---\n", re.DOTALL)
FENCED_CODE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`+[^`]*`+")
IMG_OR_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")  # keep link/alt text, drop target
BARE_URL = re.compile(r"https?://\S+")
HTML_TAG = re.compile(r"<[^>]+>")

# A token starts with a letter and may keep internal - + # (JSON-RPC, commit-sized, C#).
TOKEN = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[-+#][A-Za-z0-9]+)*")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
PAREN = re.compile(r"（([^）]*)）")

# Lowercase English stopwords that are never glossary-worthy on their own.
SKIP = {"a", "an", "the", "of", "to", "in", "on", "is", "it", "we", "i", "and", "or"}
CONTEXT_CHARS = 72


def repo_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "blog" / "docs").is_dir():
            return candidate
    raise SystemExit("Run this script from inside the KQode repository.")


def blank_span(match: re.Match) -> str:
    """Replace a match with as many newlines as it spanned (keeps line numbers)."""
    return "\n" * match.group(0).count("\n")


def strip_code_and_frontmatter(text: str) -> str:
    text = FRONTMATTER.sub(blank_span, text)
    return FENCED_CODE.sub(blank_span, text)


def prose_line(line: str) -> str:
    line = INLINE_CODE.sub(" ", line)
    line = IMG_OR_LINK.sub(lambda m: f" {m.group(1)} ", line)
    line = BARE_URL.sub(" ", line)
    return HTML_TAG.sub(" ", line)


def collect_md(paths: list[str], glossary_dir: Path) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        p = Path(raw).resolve()
        if p.is_dir():
            for dirpath, dirnames, filenames in os.walk(p):
                dirnames[:] = [d for d in dirnames if d not in PRUNE_DIRS]
                files.extend(Path(dirpath) / n for n in filenames if n.endswith(".md"))
        elif p.is_file() and p.suffix == ".md":
            files.append(p)
        else:
            print(f"# skip (not a .md file or directory): {raw}", file=sys.stderr)
    out, seen = [], set()
    for f in files:
        f = f.resolve()
        if f in seen or f == glossary_dir or glossary_dir in f.parents:
            continue
        seen.add(f)
        out.append(f)
    return out


def known_glossary(glossary_dir: Path) -> tuple[set[str], set[str]]:
    """Return (full-term lowercase set, constituent-token lowercase set)."""
    terms: set[str] = set()
    tokens: set[str] = set()
    if not glossary_dir.is_dir():
        return terms, tokens
    for f in glossary_dir.rglob("*.md"):
        text = f.read_text(encoding="utf-8")
        for span in BOLD.findall(text) + PAREN.findall(text):
            span = span.strip()
            if span:
                terms.add(span.lower())
            for tok in TOKEN.findall(span):
                tokens.add(tok.lower())
    return terms, tokens


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="Docs or directories under blog/docs")
    parser.add_argument("--glossary-dir", default=GLOSSARY_DIR_DEFAULT,
                        help=f"Glossary category dir (default: {GLOSSARY_DIR_DEFAULT})")
    parser.add_argument("--min-count", type=int, default=1,
                        help="Only report NEW candidates seen at least this many times")
    args = parser.parse_args()

    root = repo_root()
    gloss = Path(args.glossary_dir)
    glossary_dir = (gloss if gloss.is_absolute() else root / gloss).resolve()

    files = collect_md(args.paths, glossary_dir)
    if not files:
        raise SystemExit("No .md source files resolved from the given paths.")
    _, known_tokens = known_glossary(glossary_dir)

    counts: Counter[str] = Counter()
    casing: dict[str, Counter[str]] = {}
    sample: dict[str, str] = {}

    for f in files:
        rel = f.relative_to(root).as_posix() if f.is_relative_to(root) else str(f)
        text = strip_code_and_frontmatter(f.read_text(encoding="utf-8"))
        for lineno, raw_line in enumerate(text.splitlines(), start=1):
            for match in TOKEN.finditer(prose_line(raw_line)):
                term = match.group(0)
                low = term.lower()
                if low in SKIP or len(low) < 2:
                    continue
                counts[low] += 1
                casing.setdefault(low, Counter())[term] += 1
                if low not in sample:
                    snippet = raw_line.strip()
                    if len(snippet) > CONTEXT_CHARS:
                        snippet = snippet[:CONTEXT_CHARS] + "…"
                    sample[low] = f"{rel}:{lineno}  {snippet}"

    new_terms = sorted(
        (low for low in counts if low not in known_tokens and counts[low] >= args.min_count),
        key=lambda low: (-counts[low], low),
    )
    known_here = sorted(low for low in counts if low in known_tokens)

    def display(low: str) -> str:
        return casing[low].most_common(1)[0][0]

    print(f"# glossary-extract: scanned {len(files)} doc(s); glossary = "
          f"{glossary_dir.relative_to(root).as_posix() if glossary_dir.is_relative_to(root) else glossary_dir}")
    print("#")
    print("# NEW = English used in prose but not yet in the glossary. Curate each:")
    print("#   - domain proper noun / concept -> a topic section (核心概念/界面与入口/协议与通信/…)")
    print("#   - common word kept for convenience or precision -> 08-常用英文词.md (say WHY)")
    print("#   - obvious product name, code identifier, or noise you don't want -> skip")
    print()

    print(f"## NEW candidates (not in glossary): {len(new_terms)}   [count] term — first use")
    if not new_terms:
        print("  (none)")
    for low in new_terms:
        print(f"  {counts[low]:>3}  {display(low):<18} {sample[low]}")
    print()

    print(f"## Already in glossary ({len(known_here)}) — refine in place, do not re-add")
    print("  " + (", ".join(display(low) for low in known_here) if known_here else "(none)"))
    print()

    print(f"# totals: {len(new_terms)} new, {len(known_here)} known")
    return 0


if __name__ == "__main__":
    sys.exit(main())
