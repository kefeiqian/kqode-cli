---
name: kqode-blog-glossary-extract
description: Extract English words and expressions used in KQode Docusaurus blog prose into the glossary category under blog/docs/附录A-术语表/. Use when asked to add terms to the glossary, extract English keywords from one or more articles or an article range, or refresh the term list after writing new docs. Given an article name/path or a range, it scans those docs for English terms, dedupes against existing glossary entries, classifies each as a domain term (topic section) or a common word deliberately kept in English (常用英文词 section), and adds curated entries.
---

# KQode Blog Glossary Extract

Grow the blog glossary from real article usage. The glossary is a **category folder**, not a single file:

```text
blog/docs/附录A-术语表/
  _category_.json        # generated-index, slug /category/glossary, position 99
  01-核心概念.md          # domain terms, grouped by topic
  02-界面与入口.md
  03-协议与通信.md
  04-模型与工具.md
  05-文件与执行.md
  06-会话与可观测性.md
  07-工程与发布.md
  08-常用英文词.md        # common English words kept in prose (non–proper-nouns)
```

Read `blog/AGENTS.md` first. Typography, ordering, and i18n rules there still apply.

## Inputs

1. **Article range / name** — what to scan. May be a single doc (`blog/docs/02-KQode研发方式.md`), a U-unit or version folder (`blog/docs/v0.1.0/U1-研发脚手架`, `blog/docs/v0.1.1`), several paths, or a git range like `v0.1.1..v0.1.2` (resolve it to files with `git diff --name-only <range> -- 'blog/docs/**/*.md'`). If nothing is given, ask.

## Workflow

1. **Read context:** `blog/AGENTS.md`, every section file under `blog/docs/附录A-术语表/`, and its `_category_.json`. Learn the existing entries, section topics, and the entry format so you dedupe and match voice.

2. **Resolve the range to `.md` paths.** A folder means every `*.md` under it. A version/U range resolves via git or globbing. Never scan the glossary folder itself as a source.

3. **Run the extractor** from the repo root; it lists English tokens found in *prose* (code, inline code, link/image URLs, HTML, and frontmatter are stripped), with counts + first-use context, and marks which are already in the glossary:

   ```bash
   python .agents/skills/kqode-blog-glossary-extract/scripts/extract_english.py <path...> [--min-count 2]
   ```

   The "already in glossary" list is a heuristic (token-level) — treat it as *do-not-re-add*, and refine those entries in place only if a definition is now wrong.

4. **Curate the NEW candidates.** The extractor over-reports; you decide. Keep genuine terms; skip:
   - IDE/button labels and screenshot text (`New`, `Project`, `Install`, `Use`, `Hello`, `World`),
   - bare code identifiers, filenames, CLI flags, and one-off product names that add no reader value,
   - English that already has a clean, unambiguous Chinese word everyone uses.
   When unsure whether a term earns an entry, open the article and read how it is actually used.

5. **Classify each kept term and place it in the right file:**
   - **Domain proper noun / concept** → the matching topic section (`01`–`07`). Example: a new protocol term → `03-协议与通信.md`; a new file/exec term → `05-文件与执行.md`.
   - **Common English word** that is *not* a proper noun, kept only because the Chinese is awkward or English is more precise → `08-常用英文词.md`.
   - If a genuinely new topic emerges that fits no section, add a new `NN-<topic>.md` (next number, clean Chinese title, `sidebar_position: NN`) rather than overloading an existing file.

6. **Verify real values before quoting.** If an entry states a command, path, constant, or config value, confirm it against the source (article prose or the code at the article's pinned commit) — do not trust half-remembered prose.

7. **Write entries in the house format.** One bullet per term:
   - Domain term: `- **term** — 简明中文含义。<可选：KQode 里的角色/边界>`. Keep acronym/full-name style consistent with siblings, e.g. `- **VFS**（Virtual File System，虚拟文件系统）— …`.
   - Common word: `- **term** — 中文含义。<为什么保留英文：中文译法别扭 / 英文更精准 / 属某圈子惯用语>`. The "why" is required here — it is the whole point of that section.
   Append new bullets after existing ones; do not reorder or reword unrelated entries.

8. **Grammar-lint — the build will NOT catch unbalanced inline markers.** After editing, verify `**`, `*`, `_`, and `` ` `` are balanced on every changed line (an unclosed `**` renders literally instead of bolding). Quick check for the common offender:

   ```powershell
   $n=0; Get-Content -LiteralPath <file> -Encoding UTF8 | ForEach-Object { $n++
     if ((([regex]::Matches($_, '\*\*')).Count) % 2) { "line ${n}: unbalanced ** -> $_" } }
   ```

9. **Build to validate** with the parallel-safe launcher (a `blog-serve` may already hold `xtask.exe`):

   ```powershell
   ./scripts/xtask.ps1 blog-build     # Windows
   ./scripts/xtask.sh blog-build      # macOS/Linux
   ```

10. This pass is Chinese-only. Sync `blog/i18n/en` separately with `kqode-blog-translate-en` if requested.

## Rules

- One glossary, many section files under `blog/docs/附录A-术语表/`. Keep each file focused (~≤200 lines); split a section into a new topic file before it grows past that.
- Only add terms actually **used in prose** in the scanned articles. Do not invent terms or pull them from code blocks, inline code, URLs, or image paths.
- Never duplicate an entry that already exists (case-insensitive) in any section; refine in place instead.
- Common-word entries (`08`) must justify why English is kept — awkward/ambiguous translation, more precise in English, or an established community idiom. If you cannot state a reason, it probably belongs in a topic section or should be skipped.
- Chinese typography: put spaces on both sides of English words, acronyms, product names, inline code, and numbers when adjacent to CJK — in titles, prose, and every bullet.
- Keep it valid MDX: no bare `{...}`, and no bare `<` before a digit or space in prose (both parse as JS/JSX and fail the build — wrap in inline code, e.g. `` `<10` ``, or escape `<` as `&lt;`); a term like `cargo xtask <命令>` is only safe inside backticks.
- Do not change the category's `generated-index` slug (`/category/glossary`) or the `附录A-术语表` folder name; cross-links elsewhere point at `/category/glossary`.
- Match the existing entry voice: concise, definitional, Chinese explanation with the English headword bolded.
