---
name: kqode-blog-fix-article
description: Fix and polish one existing KQode Docusaurus blog article. Moves loose pasted screenshots (including repo-root Obsidian `![[...]]` embeds and any image not yet under blog/docs/images) into the article's image folder with meaningful names, adds immutable pinned-commit GitHub links for referenced source/config files, strips trailing next-article content previews, expands English acronyms to their full name with an intro link (Wikipedia/Google) on first blog-wide use, applies a caller-provided list of edits, runs a Chinese de-AI/humanize pass (humanizer-zh, chinese-writing, humanize-chinese, personal-chinese-writing-style, in fixed precedence order) over the prose, then restarts the local blog dev server. When no specific article is given, runs a full-site blog-audit instead. Use when asked to fix up, polish, clean, or update an existing blog doc, fix its pasted images or wikilinks, add commit permalinks, verify quoted code values, apply a batch of corrections, or audit the whole blog.
---

# KQode Blog Fix Article

Polish **one** existing article under `blog/docs/`. This skill assumes the doc already exists (unlike `kqode-blog-new-article`) and the caller wants it corrected in place.

Read `blog/AGENTS.md` first. All `kqode-blog-new-article` rules (ordering, frontmatter, typography, immutable links) and the MDX pitfalls in `kqode-blog-milestone-diary` still apply.

## Inputs

1. **Doc path** — one Markdown file under `blog/docs/`. **Optional:** if the caller does not name a specific article, do not fix a single doc — instead invoke the `blog-audit` skill for a full-site health assessment (quality scores, orphan pages, topic cannibalization, stale content) and return its prioritized action queue. Switch to single-article fixes only once the caller points at one.
2. **User requests** — a freeform list of specific edits to make (the skill parameter). Treat each item as a task and complete all of them.

When a doc path is given, do not touch other articles.

## Six standing jobs (always do these, even if unlisted)

1. **Move out-of-folder images into the article's image folder** and fix their links.
2. **Link every referenced project source/config file** by its path (never a bare basename), pinned to the commit.
3. **Remove next-article content previews** — trailing "下一篇看…/下一篇讲…" teasers that advertise the next article's topics.
4. **Apply every item in the user requests** parameter.
5. **Reduce AI flavor** — after the content edits, run the four Chinese-writing skills (`chinese-writing`, `humanizer-zh`, `humanize-chinese`, `personal-chinese-writing-style`) over the Chinese prose, applied in the fixed precedence order in workflow step 8, to strip AI-writing tells and tighten the voice.
6. **Expand English acronyms on first blog-wide use** — the first time an acronym appears in the blog's reading order, add its full English name **and an intro link (Wikipedia or a Google search) on that full name** so readers can jump to a definition; later occurrences and later articles keep the short form (see Rules for the format).

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

8. **De-AI / humanize the Chinese prose.** After the content edits land, run the four Chinese-writing skills over this doc's prose and apply their guidance as **in-place edits** — not a separate rewritten copy or a score report. Apply them in this fixed **precedence order** (higher wins on any conflict); resolve routine stylistic disagreements silently, do not stop to ask about them:

   0. **Project rules always win.** `blog/AGENTS.md` + the `kqode-blog-*` rules override every skill: full-width Chinese punctuation including `——` and `……`, spaces around English words / acronyms / product names / inline code adjacent to CJK, valid MDX, immutable pinned-commit permalinks, verified quoted values, no next-article teasers, no duplicate body `# H1`, objective wording with minimal second-person `你` / `你的`.
   1. **`chinese-writing`** — house baseline: structure, 去 AI 味六原则, and punctuation (aligned with rule 0).
   2. **`humanizer-zh`** — remove AI-writing tells (维基百科 “AI 写作特征”).
   3. **`humanize-chinese`** — extra de-AI / AIGC-signal reduction. **Keep its platform style-conversion modes (`zhihu`/`xiaohongshu`/`wechat`/`weibo`/`literary`) and academic-hedging moves OFF** — this is a neutral technical dev blog; apply a target-platform voice only if the caller explicitly asks.
   4. **`personal-chinese-writing-style`** — final voice/tone polish (delete trust-me lines, avoid business clichés, keep endings light, no duplicate H1). **Override its punctuation rules** where they conflict with rule 0: keep full-width `——` (not ` - `), `……` (not `......`), and Chinese quotes — the blog's established typography wins.

   Guardrails (apply to every pass):
   - Rewrite only Chinese prose (paragraph text, list-item text, headings). **Never touch** fenced code blocks, inline code, shell commands, file paths, GitHub permalinks or their visible path text, frontmatter, image links / alt structure, or any exact value quoted from the pinned commit.
   - Humanizing changes voice, not content: do not invent facts, drop a citation, or soften a verified technical claim.
   - Prefer objective, impersonal Chinese wording. Reduce second-person `你` / `你的` when the sentence stays clear; omit the pronoun instead of replacing it with another address form. Example: write `把输入框改大`, not `把你的输入框改大`.
   - Match the user's dev-diary voice: technical but conversational, like explaining a real implementation after doing the work. Prefer short, natural connectors such as “先看”“这里”“所以”“换句话说”“这一步”; avoid report-style glue such as “综上所述”“值得注意的是”“由此可见”“本文将深入探讨”.
   - Keep the prose centered on **why / tradeoff / boundary**. Do not turn the article into a line-by-line API dump; start sections from the problem being solved, then show the relevant code and explain what the code buys.
   - Use concrete examples before abstractions when a concept is easy to misunderstand: a small sequence, table, screenshot, or “以 `a😀b` 为例” often reads more human than a definition-only paragraph.
   - Keep personal tone light and sparse. `我们` is fine for the shared build journey, `笔者` is only for occasional author notes, and the article should not sound like a sales page or tutorial script.
   - Prefer natural product words already used in the polished docs: `主界面` over `主屏`, `输入框` over `composer` when not referring to code, `方案` over bureaucratic `计划` when the prose means the reviewed output rather than a file name or Plan Unit.
   - Keep useful English terms when the Chinese version is awkward or less precise (for example review、helper、fixture、item、commit-sized), but use them deliberately and explain or link the first meaningful occurrence.
   - Reduce mechanical over-bolding but keep sparse, intentional **加粗** of key terms.
   - Keep the doc MDX-valid; re-check inline-marker balance in the grammar-lint step below.
   - **Only prompt the caller for a *material* conflict the precedence order cannot settle** — e.g. a rewrite that would change meaning or drop a verified fact, or a requested target register that clashes with the blog's technical voice. Resolve everything else silently by precedence.

9. **Grammar-lint the Markdown — the build will NOT catch this.** Unbalanced inline markers are *valid* MDX: they compile clean but render literally (an unclosed `**` prints `**可交互的主界面` instead of bolding it; an unclosed `` ` `` swallows the rest of the line as code). After every edit, verify inline markup is balanced. A quick per-line heuristic for the most common offender (odd number of `**`):

   ```powershell
   $n=0; Get-Content -LiteralPath <doc> -Encoding UTF8 | ForEach-Object { $n++
     if ((([regex]::Matches($_, '\*\*')).Count) % 2) { "line ${n}: unbalanced ** -> $_" } }
   ```

   Also eyeball: unclosed inline code `` ` ``, unbalanced `*italic*` / `_italic_`, and stray `]`/`)` from half-finished `[text](url)` links. Emphasis must hug non-space text (`**词**`, not `** 词 **`), and a marker opened on one line does not close on the next.

10. **Build to validate:** prefer the parallel-safe launcher, because a `blog-serve`/`blog-preview` may already hold `xtask.exe`:

   ```powershell
   ./scripts/xtask.ps1 blog-build     # Windows
   ./scripts/xtask.sh blog-build      # macOS/Linux
   ```

   `onBrokenLinks: 'throw'` means every internal `.md`/category link must resolve; missing local images only warn.

11. **Refresh the dev server.** The recommended dev server is `blog-dev` (via the `kqode-blog-serve` skill), which **auto-restarts** on the new/renamed docs, images, and config this skill produces — so if it is already running, just wait a moment (watch for its `[blog-dev] restarting — …` line) and confirm the fixed page loads on `http://127.0.0.1:3000/kqode-cli/`. If nothing is running, start `blog-dev`. Only force a manual restart if a plain `blog-serve` (no auto-restart wrapper) is running, since it misses new/renamed docs, images, and config.

12. **Clean up** superseded/leftover loose pastes only after confirming the doc uses the kept images. Deleting a loose paste is destructive — do it only when the user asked to, or after they confirm.

13. This pass is Chinese-only. Sync `blog/i18n/en` separately with `kqode-blog-translate-en` if requested.

## Rules

- Change only the requested doc and its own image assets. Preserve concurrent edits — target unique strings so edits do not clobber the caller's live typing.
- Immutable commit links only; never `main` for project source/config files, because it drifts after publish. Match existing docs' `kefeiqian/KQode` blob base even though the repo was renamed (old URLs 301-redirect).
- Every referenced repo file is a pinned-commit permalink whose **visible text is a path, not a bare basename** (e.g. `theme/themeConfig.ts`, not `themeConfig.ts`); the `href` uses the full repo-relative path. This holds in headings, tables, and inline prose alike.
- Image folder names are stable English kebab-case topic slugs with no numeric prefix or Chinese; file names are meaningful English kebab-case.
- Never invent code. Quote and describe only what exists at the pinned commit; verify constants/paths with `git show`/`git cat-file` before writing them.
- Humanizing changes voice, not facts: the four-skill Chinese pass (`chinese-writing`, `humanizer-zh`, `humanize-chinese`, `personal-chinese-writing-style`) rewrites only Chinese prose and must leave code, commands, file paths, permalinks (and their visible path text), frontmatter, image links, and verified quoted values untouched.
- Keep Chinese prose objective and avoid unnecessary second-person `你` / `你的`; when possible, omit the pronoun entirely (for example, `把输入框改大` instead of `把你的输入框改大`).
- Resolve conflicts between the four Chinese-writing skills by the fixed precedence in workflow step 8 (project rules > `chinese-writing` > `humanizer-zh` > `humanize-chinese` > `personal-chinese-writing-style`); apply silently and prompt the caller only for a material meaning/voice conflict the order cannot settle. Keep the blog's full-width Chinese punctuation (`——`, `……`, Chinese quotes) even when `personal-chinese-writing-style` asks for ` - `/`......`/straight quotes, and keep `humanize-chinese` platform/academic style modes off unless explicitly requested.
- With no doc path, this skill runs `blog-audit` (full-site health) instead of editing a single article; switch to single-article fixes only once the caller names one.
- Keep the doc valid MDX: no bare `{...}` **or bare `<` before a digit/space** in prose (both parse as JS/JSX and fail the build — wrap in inline code, e.g. `` `<10` ``, or escape `<` as `&lt;`); wrap inline code containing a backtick in double backticks; no blank lines inside tables or frontmatter; single blank lines between blocks.
- Balance every inline marker. Unclosed `**`/`*`/`_`/`` ` `` is valid MDX that compiles but renders literally, so `blog-build` will NOT flag it — re-check balance after each edit (see workflow step 9).
- Chinese typography: spaces on both sides of English words, acronyms, product names, and inline code adjacent to CJK — in titles, headings, prose, alt text, and table cells.
- Expand English acronyms on their **first blog-wide use**: before expanding one in the current doc, grep the whole `blog/docs` tree and use the blog's reading order (numeric filename prefixes + `_category_.json` positions, i.e. the sidebar order) — expand only if no earlier-ordered doc already uses that acronym in prose, otherwise keep the short form. On that first occurrence add the verified full English name in full-width parens **and wrap that full name in an intro link** so readers can jump to a definition: a Chinese term becomes `中文术语（[Full English Name](intro-url), ACRONYM）` (e.g. `基本多文种平面（[Basic Multilingual Plane](https://en.wikipedia.org/wiki/Plane_%28Unicode%29), BMP）`), and a standalone acronym becomes `ACRONYM（[Full English Name](intro-url)）`. Prefer a canonical `intro-url` — a specific Wikipedia article, or the term's official spec/docs for a protocol/tool — that you have verified exists; fall back to a Google search link `https://www.google.com/search?q=<url-encoded full name>` when there is no clean canonical page. Percent-encode parentheses in the URL (`(`→`%28`, `)`→`%29`, common in Wikipedia disambiguation links like `Plane_%28Unicode%29`) so the Markdown link does not break. Never expand acronyms inside code, inline code, file paths, or permalinks; recurring uses in the same doc stay short; verify the full name rather than guessing; the Glossary appendix (附录 A：术语表) stays the blog-wide reference for later articles.
- Do not preview the next article's content. Strip trailing "下一篇看…/下一篇讲…" teasers such as "下一篇看工作目录行和 Git 状态解析。"; each article stands alone. Keep in-scope deferral pointers that say where a specific topic is covered (e.g. "…放到第 9 篇讲。").
- Keep files focused (~≤200 lines); this includes the helper script.
- After a successful build, make sure the dev server reflects new/renamed docs, images, or config: the `blog-dev` auto-restart server (via `kqode-blog-serve`) picks these up automatically; only a plain `blog-serve` needs a manual restart. Confirm the fixed page loads on `http://127.0.0.1:3000/kqode-cli/`.
