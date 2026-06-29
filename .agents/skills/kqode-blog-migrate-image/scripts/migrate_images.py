#!/usr/bin/env python3
"""Move a blog doc's referenced images into an article-specific images folder."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import unquote

IMAGE_PATTERN = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<target>[^)]+)\)")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
PINYIN_HINTS = {
    "kqode介绍": "kqode-introduction",
    "kqode研发方式": "kqode-development-workflow",
    "创建rust项目": "create-rust-project",
    "创建前端tui项目": "create-frontend-tui-project",
    "技术选型": "technical-selection",
    "需求分析": "requirements-analysis",
}
PHRASE_HINTS = {
    "RustRover 欢迎页，点击 New Project": "rustrover-welcome-new-project",
    "Rust 项目向导中尚未安装 Rust 工具链": "new-project-missing-toolchain",
    "点击 Install Rustup 安装 Rust 工具链": "install-rustup-toolchain",
    "Rust 工具链安装完成，创建 Binary 项目": "new-project-ready-create",
    "RustRover 许可证选择窗口": "rustrover-license-selection",
    "选择个人非商业用途": "non-commercial-use-options",
    "JetBrains 授权成功页面": "jetbrains-login-success",
    "同意非商业使用条款": "non-commercial-terms",
    "RustRover 已切换到 Non-commercial use": "non-commercial-status",
    "默认生成的 main.rs": "default-main-rs",
    "点击顶部运行按钮": "run-button",
    "Run 窗口输出 Hello, world": "hello-world-output",
}


def repo_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "blog" / "docs").is_dir():
            return candidate
    raise SystemExit("Run this script from inside the KQode repository.")


def slugify(text: str, fallback: str) -> str:
    cleaned = re.sub(r"^\d+(?:\.\d+)?[-_ ]*", "", text.strip()).lower()
    if cleaned in PINYIN_HINTS:
        return PINYIN_HINTS[cleaned]
    if text.strip() in PHRASE_HINTS:
        return PHRASE_HINTS[text.strip()]
    ascii_text = re.sub(r"[^a-z0-9]+", "-", cleaned)
    ascii_text = re.sub(r"-{2,}", "-", ascii_text).strip("-")
    return ascii_text or fallback


def parse_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<"):
        closing_index = target.find(">")
        if closing_index >= 0:
            return unquote(target[1:closing_index])

    for extension in sorted(IMAGE_EXTENSIONS, key=len, reverse=True):
        match = re.search(rf"{re.escape(extension)}(?=\s|$)", target, flags=re.IGNORECASE)
        if match is not None:
            return unquote(target[: match.end()])

    return unquote(target)


def is_migratable(target: str) -> bool:
    lower = target.lower().replace("\\", "/")
    normalized = lower.removeprefix("./")
    if "://" in lower or normalized.startswith(("#", "/", "images/")):
        return False
    return Path(target).suffix.lower() in IMAGE_EXTENSIONS


def unique_path(path: Path, reserved: set[Path] | None = None) -> Path:
    reserved = reserved or set()
    if path not in reserved and not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    for index in range(2, 1000):
        candidate = path.with_name(f"{stem}-{index}{suffix}")
        if candidate not in reserved and not candidate.exists():
            return candidate
    raise RuntimeError(f"Could not find available filename for {path}")


def migrate(doc_path: Path) -> int:
    root = repo_root()
    docs_root = root / "blog" / "docs"
    doc_path = doc_path.resolve()
    if not doc_path.is_file():
        raise SystemExit(f"Doc does not exist: {doc_path}")
    if not doc_path.is_relative_to(docs_root):
        raise SystemExit(f"Doc must be under {docs_root}")

    content = doc_path.read_text(encoding="utf-8")
    doc_slug = slugify(doc_path.stem, f"doc-{doc_path.stem}")
    target_dir = docs_root / "images" / doc_slug
    replacements: dict[str, str] = {}
    used_names: set[str] = set()
    reserved_destinations: set[Path] = set()
    planned_destinations: dict[Path, Path] = {}
    planned_moves: list[tuple[str, Path, Path]] = []

    for match_index, match in enumerate(IMAGE_PATTERN.finditer(content), start=1):
        raw_target = match.group("target")
        target = parse_target(raw_target)
        if not is_migratable(target):
            continue

        source = (doc_path.parent / target).resolve()
        if not source.is_file():
            raise SystemExit(f"Referenced image not found: {target}")
        if not source.is_relative_to(docs_root):
            raise SystemExit(f"Refusing to migrate image outside blog/docs: {source}")

        if source in planned_destinations:
            destination = planned_destinations[source]
            replacements[raw_target] = destination.relative_to(doc_path.parent).as_posix()
            continue

        fallback = f"{doc_slug}-{match_index:02d}"
        new_stem = slugify(match.group("alt"), fallback)
        while new_stem in used_names:
            new_stem = f"{new_stem}-{match_index:02d}"
        used_names.add(new_stem)

        destination = unique_path(
            target_dir / f"{new_stem}{source.suffix.lower()}",
            reserved_destinations,
        )
        reserved_destinations.add(destination)
        planned_destinations[source] = destination
        planned_moves.append((target, source, destination))
        relative = destination.relative_to(doc_path.parent).as_posix()
        replacements[raw_target] = relative

    if not replacements:
        print("No migratable images found.")
        return 0

    updated_content = content
    for old, new in replacements.items():
        updated_content = updated_content.replace(f"]({old})", f"]({new})")

    target_dir.mkdir(parents=True, exist_ok=True)
    copied_destinations: list[Path] = []
    temp_doc_path = doc_path.with_name(f".{doc_path.name}.tmp")
    try:
        for _target, source, destination in planned_moves:
            shutil.copy2(str(source), str(destination))
            copied_destinations.append(destination)

        temp_doc_path.write_text(updated_content, encoding="utf-8")
        os.replace(temp_doc_path, doc_path)
    except Exception:
        if temp_doc_path.exists():
            temp_doc_path.unlink()
        for destination in copied_destinations:
            if destination.exists():
                destination.unlink()
        raise

    for target, source, destination in planned_moves:
        source.unlink()
        print(f"{target} -> {destination.relative_to(doc_path.parent).as_posix()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("doc", help="Path to a Markdown doc under blog/docs")
    args = parser.parse_args()
    return migrate(Path(args.doc))


if __name__ == "__main__":
    sys.exit(main())
