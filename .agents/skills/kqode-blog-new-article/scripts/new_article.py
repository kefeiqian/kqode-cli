#!/usr/bin/env python3
"""Create a new KQode blog article and its stable image folder."""

from __future__ import annotations

import argparse
import math
import re
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path


DOC_PREFIX_PATTERN = re.compile(r"^(?P<prefix>\d+(?:\.\d+)?)-")
ORDER_PATTERN = re.compile(r"^(?P<integer>\d+)(?:\.(?P<fraction>\d+))?$")
SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
INVALID_WINDOWS_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]+')
DEFAULT_ORDER_WIDTH = 2


@dataclass(frozen=True)
class ArticleOrder:
    value: Decimal
    integer: int
    fraction: str

    @property
    def is_integer(self) -> bool:
        return self.fraction == ""


def repo_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "blog" / "docs").is_dir():
            return candidate
    raise SystemExit("Run this script from inside the KQode repository.")


def parse_order(raw_order: str) -> ArticleOrder:
    raw_order = raw_order.strip()
    match = ORDER_PATTERN.fullmatch(raw_order)
    if match is None:
        raise SystemExit(f"Invalid order '{raw_order}'. Use values like 4, 04, 1.5, or 2.5.")

    integer = int(match.group("integer"))
    fraction = (match.group("fraction") or "").rstrip("0")
    decimal_text = f"{integer}.{fraction}" if fraction else str(integer)

    try:
        value = Decimal(decimal_text)
    except InvalidOperation as error:
        raise SystemExit(f"Invalid order '{raw_order}'.") from error

    if value <= 0:
        raise SystemExit("Order must be greater than zero.")

    return ArticleOrder(value=value, integer=integer, fraction=fraction)


def existing_orders(docs_root: Path) -> list[tuple[ArticleOrder, int]]:
    orders: list[tuple[ArticleOrder, int]] = []
    for path in docs_root.glob("*.md"):
        match = DOC_PREFIX_PATTERN.match(path.name)
        if match is None:
            continue
        prefix = match.group("prefix")
        order = parse_order(prefix)
        integer_width = len(prefix.split(".", 1)[0])
        orders.append((order, integer_width))
    return orders


def next_order(orders: list[tuple[ArticleOrder, int]]) -> ArticleOrder:
    if not orders:
        return ArticleOrder(value=Decimal(1), integer=1, fraction="")
    largest = max(order.value for order, _width in orders)
    next_integer = math.floor(largest) + 1
    return ArticleOrder(value=Decimal(next_integer), integer=next_integer, fraction="")


def order_width(orders: list[tuple[ArticleOrder, int]], order: ArticleOrder) -> int:
    existing_width = max((width for _order, width in orders), default=DEFAULT_ORDER_WIDTH)
    return max(DEFAULT_ORDER_WIDTH, existing_width, len(str(order.integer)))


def format_order_prefix(order: ArticleOrder, width: int) -> str:
    prefix = f"{order.integer:0{width}d}"
    if order.fraction:
        return f"{prefix}.{order.fraction}"
    return prefix


def format_display_order(order: ArticleOrder) -> str:
    if order.fraction:
        return f"{order.integer}.{order.fraction}"
    return str(order.integer)


def filename_title(title: str) -> str:
    safe = INVALID_WINDOWS_FILENAME_CHARS.sub("-", title.strip())
    safe = re.sub(r"\s+", "-", safe)
    safe = re.sub(r"-{2,}", "-", safe).strip("-. ")
    if not safe:
        raise SystemExit("Title does not contain any filename-safe characters.")
    return safe


def auto_slug(title: str) -> str:
    lowered = title.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", lowered)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    slug = re.sub(r"^\d+-*", "", slug)
    return slug


def validate_slug(slug: str) -> str:
    normalized = slug.strip().lower()
    if not SLUG_PATTERN.fullmatch(normalized):
        raise SystemExit(
            "Image slug must be stable English kebab-case, start with a letter, "
            "and avoid numeric ordering prefixes. Example: create-frontend-tui-project."
        )
    return normalized


def yaml_title(value: str) -> str:
    if re.search(r'[:#\[\]{},"\\]|^\s|\s$', value):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def frontmatter(order: ArticleOrder, display_order: str, title: str) -> str:
    lines = ["---"]
    lines.append(f"sidebar_position: {display_order}")
    lines.append(f"title: {yaml_title(f'{display_order}. {title}')}")
    lines.append("---")
    lines.append("")
    lines.append("")
    return "\n".join(lines)


def create_article(title: str, raw_order: str | None, slug: str | None, dry_run: bool) -> int:
    root = repo_root()
    docs_root = root / "blog" / "docs"
    images_root = docs_root / "images"

    orders = existing_orders(docs_root)
    order = parse_order(raw_order) if raw_order else next_order(orders)
    width = order_width(orders, order)
    order_prefix = format_order_prefix(order, width)
    display_order = format_display_order(order)

    image_slug = validate_slug(slug or auto_slug(title))
    doc_name = f"{order_prefix}-{filename_title(title)}.md"
    doc_path = docs_root / doc_name
    image_dir = images_root / image_slug

    if doc_path.exists():
        raise SystemExit(f"Doc already exists: {doc_path.relative_to(root)}")

    content = frontmatter(order, display_order, title)

    print(f"doc: {doc_path.relative_to(root)}")
    print(f"images: {image_dir.relative_to(root)}")

    if dry_run:
        return 0

    image_dir.mkdir(parents=True, exist_ok=True)
    doc_path.write_text(content, encoding="utf-8")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("title", help="Human-facing Chinese article title")
    parser.add_argument(
        "--order",
        help="Optional article order, such as 4, 04, 1.5, or 2.5. Defaults to the next whole number.",
    )
    parser.add_argument(
        "--slug",
        help="Stable English kebab-case image folder slug, such as create-frontend-tui-project.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print paths without writing files.")
    args = parser.parse_args()

    return create_article(args.title, args.order, args.slug, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
