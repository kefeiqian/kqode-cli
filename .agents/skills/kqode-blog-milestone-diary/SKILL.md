---
name: kqode-blog-milestone-diary
description: Document a KQode git milestone (a U-tag's single commit, or a version release range such as v0.1.1..v0.1.2) as a set of Chinese dev-diary blog articles under blog/docs/v0.1.x/, one file per feature point, with real code quoted from the pinned commit, "why" rationale, and screenshot placeholders. Use when asked to write up a tag/release, introduce a milestone's commit, document U2..U13 or a version range, or reorganize dev-diary articles into v0.1.x release categories.
---

# KQode Blog Milestone Dev-Diary

Turn a shipped git milestone into an in-depth, per-feature Chinese article set that explains **what changed and why**, grounded in the real commit. This is the "release dev-diary" pattern; for a single standalone article use `kqode-blog-new-article` instead.

Read `blog/AGENTS.md` first. The `kqode-blog-new-article` rules (ordering, frontmatter, typography, immutable links) all still apply here.

## Directory model

Dev-diary docs are organized as **release categories**, each with a `_category_.json`:

```text
blog/docs/
  v0.1.0/            (position 3; the intro docs 01/02 keep positions 1-2)
    U1-研发脚手架/     ... U13-Release流水线/    each U* = one tagged commit
  v0.1.1/  v0.1.2/  v0.1.3/                      each = one version range
```

- `v0.1.0/` groups the U1–U13 milestone subcategories; later versions are flat.
- **Image path depth differs by nesting level** — this is the most common breakage:
  - U-milestone docs (`v0.1.0/U5-.../03-x.md`, two levels deep): `../../images/<slug>/<file>.png`
  - Version-range docs (`v0.1.1/02-x.md`, one level deep): `../images/<slug>/<file>.png`
- Image slugs are stable English kebab-case topics, no ordering prefix or Chinese (e.g. `u5-jsonrpc-protocol`, `v0-1-3-npm-resolution`).

## Workflow

1. **Recon the milestone — never invent code.** Run the helper from the repo root:

   ```bash
   # Single U-milestone (one tagged commit):
   python .agents/skills/kqode-blog-milestone-diary/scripts/milestone_recon.py U5
   # Version release (a span of commits):
   python .agents/skills/kqode-blog-milestone-diary/scripts/milestone_recon.py v0.1.1..v0.1.2
   ```

   It prints the SHA(s), subject(s), real parent, permalink base, `--stat`, and graph context.

2. **Scope correctly (subtle — get this right):**
   - A **U-tag documents exactly `git show <TAG>`** — that one commit's diff vs its real parent `<TAG>^`. Tag numbering is **not** commit order (e.g. U4's commit predates U2/U3), so do **not** document `<previousTag>..<thisTag>`; that range can reach back through other tagged milestones.
   - A **version tag documents the range** `<prevVersion>..<thisVersion>` — write one article per substantive commit, and mention trivial release chores in the overview.

3. **Quote only real code** with `git show <SHA>:<path>`. Every source/config link and code block must match the pinned commit, never `main` or the working tree.

4. **Create the category folder(s) and `_category_.json`** (see template below). Use an English generated-index slug so locale switching never exposes a Chinese URL.

5. **Split into per-feature files** (每个功能点分开文件写). Keep files focused (~≤200 lines):
   - `01-...总览.md` — overview: what shipped (from the previous state), tag + commit permalink, plan-doc mapping if any, a data-flow sketch, and a 文件地图/篇目 table.
   - one file per real feature point / module, each with **code + why** (rationale, tradeoffs, alternatives rejected, what was deferred). Depth on "为什么这么做" is the priority.
   - `NN-...总结.md` — summary: deliverables, key decisions (each with its why), deferred items.

6. **Screenshot placeholders are expected.** Where a screenshot helps, link a not-yet-created file: `![中文描述](../../images/<slug>/<name>.png)` (adjust depth per level above). Do not create image files. The build is configured to warn (not fail) on missing local images (see Pitfalls).

7. **Build and verify:** run `cargo xtask blog-build`. Confirm categories appear at the right sidebar position and only expected image warnings remain.
   - If it fails with Docusaurus missing `blog\build\__server\server.bundle.js`, remove `blog\build` and rerun once. Treat repeated failure as a real failure.

8. This pass is Chinese-only. Sync `blog/i18n/en` later with `kqode-blog-translate-en`.

## Frontmatter and `_category_.json`

Every article:

```md
---
sidebar_position: <N>
title: <N>. <中文标题>
---
```

Category file (English index slug, integer `position`):

```json
{
  "label": "U5-JSON-RPC 协议",
  "position": 5,
  "link": {
    "type": "generated-index",
    "slug": "/category/u5-jsonrpc-protocol",
    "description": "KQode U5 阶段（tag U5 / commit ac566c70）：……。"
  }
}
```

## MDX pitfalls and fixes (learned the hard way)

Docusaurus 3 compiles Markdown as MDX and enforces links strictly. Avoid these:

- **Bare `{...}` in prose is a JS expression.** Text like `{pkg}` or `${x}` outside a code span throws `ReferenceError: pkg is not defined` at build. Keep such tokens inside inline code or fenced blocks.
- **Single backticks cannot nest.** Inline code that itself contains a backtick (e.g. `` `require.resolve(`${pkg}/x`)` ``) must be wrapped in **double** backticks.
- **Never double-space a whole file** (a blank line after every line). It breaks Markdown tables and frontmatter (blank lines between `|` rows split the table; a blank line inside `--- ... ---` breaks frontmatter). Use single blank lines between blocks only.
- **`onBrokenLinks: 'throw'` is still enforced.** Internal doc links must resolve. Link **across categories by the stable `/category/<slug>`** (e.g. `[U8](/category/u8-submit-ack-wiring)`), not by a relative folder path like `../U8-提交与ACK接线`.
- **Missing local images only warn**, because `blog/docusaurus.config.ts` sets `markdown.hooks.onBrokenMarkdownImages: 'warn'`. This is what makes screenshot placeholders safe. Keep that setting; do not switch it back to throw.
- **Typography:** in Chinese docs put a space on both sides of English words, acronyms, product names, and inline code adjacent to Chinese — in titles, headings, prose, and alt text.

## Scaling to many milestones

Documenting a whole release (U2–U13 + version ranges) is large. Dispatch one background agent per milestone (or small group) in parallel, giving each a fully self-contained prompt: the exact tag/parent SHAs, the target directory, the layout/frontmatter/typography rules above, the image-path depth for that level, and "quote only `git show <SHA>:<path>`, never `main`." Then run one `cargo xtask blog-build` at the end and fix any MDX pitfalls centrally.
