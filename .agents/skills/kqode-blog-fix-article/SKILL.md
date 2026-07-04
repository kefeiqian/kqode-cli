---
name: kqode-blog-fix-article
description: Fix and polish one existing KQode Docusaurus blog article. Moves loose pasted screenshots (including repo-root Obsidian `![[...]]` embeds and any image not yet under blog/docs/images) into the article's image folder with meaningful names, adds immutable pinned-commit GitHub links for every referenced project source/config file, strips trailing next-article content previews, and applies a caller-provided list of edits, then restarts the local blog dev server so the change is live. Use when asked to fix up, polish, clean, or update an existing blog doc, move/insert/replace its pasted images and convert wikilinks, add commit permalinks to files it mentions, verify quoted code values, or apply a batch of specific corrections to one article.
---

# KQode Blog Fix Article

Polish **one** existing article under `blog/docs/`. This skill assumes the doc already exists (unlike `kqode-blog-new-article`) and the caller wants it corrected in place.

Read `blog/AGENTS.md` first. All `kqode-blog-new-article` rules (ordering, frontmatter, typography, immutable links) and the MDX pitfalls in `kqode-blog-milestone-diary` still apply.

## Inputs

1. **Doc path** — one Markdown file under `blog/docs/`.
2. **User requests** — a freeform list of specific edits to make (the skill parameter). Treat each item as a task and complete all of them.

If the doc path is missing, ask. Do not touch other articles.

## Four standing jobs (always do these, even if unlisted)

1. **Move out-of-folder images into the article's image folder** and fix their links.
2. **Link every referenced project source/config file** by its path (never a bare basename), pinned to the commit.
3. **Remove next-article content previews** — trailing "下一篇看…/下一篇讲…" teasers that advertise the next article's topics.
4. **Apply every item in the user requests** parameter.

## Workflow

1. **Read context:** `blog/AGENTS.md`, the target doc, and its sibling docs / `_category_.json` (for cross-links and slugs).

2. **Find the pinned commit.** Reuse the commit the article already documents (its existing `blob/<sha>` permalinks or a "commit" section). If unknown, ask — never link to `main` or the working tree.

3. **Discover loose images.** Run the discovery helper from the repo root; it lists both `![](...)` links and Obsidian `![[...]]` embeds that are not yet under `blog/docs/images/`, resolves candidate source files (repo root, `blog/docs`, vault), and prints each with size + mtime plus the correct relative prefix for this doc's nesting depth:

   ```bash
   python .agents/skills/kqode-blog-fix-article/scripts/find_loose_images.py blog/docs/<path>.md
   ```

4. **View every candidate image before moving it.** This is mandatory:
   - The caller often pastes/replaces images while you work; a file's bytes/name can change mid-task. `Get-ChildItem ... Length` can misreport tiny sizes — confirm real bytes with `[System.IO.File]::ReadAllBytes(...)` and the PNG signature `89 50 4E 47` when in doubt.
   - When the user says "use the latest" / "I changed the last picture", pick the **newest by mtime** and confirm by viewing; treat older near-duplicates as superseded.

5. **Move + relink images:**
   - Destination: `blog/docs/images/<stable-english-kebab-slug>/`. No numeric prefix, no translated Chinese in the folder or file names. Reuse the article's existing slug if it already has one.
   - Name each file meaningfully in English from what the screenshot shows (e.g. `home-screen-with-transcript.png`).
   - Convert `![[Name]]` embeds to real Markdown `![descriptive alt](<relative>/images/<slug>/<file>.png)`; use the exact relative prefix the helper printed (`../../images/...` two levels deep, `../images/...` one level deep).
   - Alt text is descriptive Chinese with spaces around English words, acronyms, product names, and numbers adjacent to CJK.

6. **Link referenced pinned files by their path.** For every project source/config file the doc names or quotes — in prose, headings, tables, or lists — verify it exists at the pinned commit and turn it into an immutable permalink:

   ```bash
   git cat-file -e <sha>:<path>   # exit 0 = exists at that commit
   ```

   Base: `https://github.com/kefeiqian/KQode/blob/<sha>/<full-repo-relative-path>` (the `href` always carries the full repo-root-relative path, e.g. `tui/src/theme/themeConfig.ts`). The **visible link text must be a path, never a bare basename** — include enough leading directories to locate and disambiguate the file (e.g. `theme/themeConfig.ts` or `components/BackgroundBlock.tsx`, not `themeConfig.ts`). This applies even inside a heading: `## 主题：[`theme/themeConfig.ts`](…)`. Every mention of a real repo file should be such a permalink, not plain text. Cross-doc links use `./NN-<name>.md`; cross-category links use `/category/<slug>`.

7. **Apply the user requests.** Complete each requested edit. Before writing any concrete value quoted from code (a constant, default, enum, path), read it at the pinned commit (`git show <sha>:<path>`) and use the real value — do not trust the prose that is already there.

8. **Grammar-lint the Markdown — the build will NOT catch this.** Unbalanced inline markers are *valid* MDX: they compile clean but render literally (an unclosed `**` prints `**可交互的主界面` instead of bolding it; an unclosed `` ` `` swallows the rest of the line as code). After every edit, verify inline markup is balanced. A quick per-line heuristic for the most common offender (odd number of `**`):

   ```powershell
   $n=0; Get-Content -LiteralPath <doc> -Encoding UTF8 | ForEach-Object { $n++
     if ((([regex]::Matches($_, '\*\*')).Count) % 2) { "line ${n}: unbalanced ** -> $_" } }
   ```

   Also eyeball: unclosed inline code `` ` ``, unbalanced `*italic*` / `_italic_`, and stray `]`/`)` from half-finished `[text](url)` links. Emphasis must hug non-space text (`**词**`, not `** 词 **`), and a marker opened on one line does not close on the next.

9. **Build to validate:** prefer the parallel-safe launcher, because a `blog-serve`/`blog-preview` may already hold `xtask.exe`:

   ```powershell
   ./scripts/xtask.ps1 blog-build     # Windows
   ./scripts/xtask.sh blog-build      # macOS/Linux
   ```

   `onBrokenLinks: 'throw'` means every internal `.md`/category link must resolve; missing local images only warn.

10. **Restart the dev server.** After the build passes, restart the local blog dev server via the `kqode-blog-serve` skill so the running preview picks up new or renamed docs, images, and config (hot reload misses those). If none is running, start one; either way confirm it comes up on `http://127.0.0.1:3000` and the fixed page loads.

11. **Clean up** superseded/leftover loose pastes only after confirming the doc uses the kept images. Deleting a loose paste is destructive — do it only when the user asked to, or after they confirm.

12. This pass is Chinese-only. Sync `blog/i18n/en` separately with `kqode-blog-translate-en` if requested.

## Rules

- Change only the requested doc and its own image assets. Preserve concurrent edits — target unique strings so edits do not clobber the caller's live typing.
- Immutable commit links only; never `main` for project source/config files, because it drifts after publish. Match existing docs' `kefeiqian/KQode` blob base even though the repo was renamed (old URLs 301-redirect).
- Every referenced repo file is a pinned-commit permalink whose **visible text is a path, not a bare basename** (e.g. `theme/themeConfig.ts`, not `themeConfig.ts`); the `href` uses the full repo-relative path. This holds in headings, tables, and inline prose alike.
- Image folder names are stable English kebab-case topic slugs with no numeric prefix or Chinese; file names are meaningful English kebab-case.
- Never invent code. Quote and describe only what exists at the pinned commit; verify constants/paths with `git show`/`git cat-file` before writing them.
- Keep the doc valid MDX: no bare `{...}` **or bare `<` before a digit/space** in prose (both parse as JS/JSX and fail the build — wrap in inline code, e.g. `` `<10` ``, or escape `<` as `&lt;`); wrap inline code containing a backtick in double backticks; no blank lines inside tables or frontmatter; single blank lines between blocks.
- Balance every inline marker. Unclosed `**`/`*`/`_`/`` ` `` is valid MDX that compiles but renders literally, so `blog-build` will NOT flag it — re-check balance after each edit (see workflow step 8).
- Chinese typography: spaces on both sides of English words, acronyms, product names, and inline code adjacent to CJK — in titles, headings, prose, alt text, and table cells.
- Do not preview the next article's content. Strip trailing "下一篇看…/下一篇讲…" teasers such as "下一篇看工作目录行和 Git 状态解析。"; each article stands alone. Keep in-scope deferral pointers that say where a specific topic is covered (e.g. "…放到第 9 篇讲。").
- Keep files focused (~≤200 lines); this includes the helper script.
- After a successful build, restart the dev server via the `kqode-blog-serve` skill so the running preview reflects new/renamed docs, images, or config; confirm the fixed page loads on `http://127.0.0.1:3000`.
