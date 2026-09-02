---
date: 2026-07-12
topic: terminal-code-block-and-math-rendering
question: "How do reference coding agents handle code-block and math (LaTeX) rendering in the terminal?"
status: partial
---

# Terminal Code-Block and Math Rendering Across Reference Agents

## Summary

Across the default-scope reference agents, **code blocks are universally syntax-highlighted** in the terminal, but through different engines: the `highlight.js` family (`cli-highlight` in Claude Code and Kimi Code, `lowlight` in Gemini CLI), Rust `syntect` + `two-face` (Codex), tree-sitter grammars via `opentui` (OpenCode's TUI), and a hand-rolled regex ANSI pass (KimiX's Python CLI). [\[1\]][ref-1] [\[2\]][ref-2] [\[5\]][ref-5] [\[11\]][ref-11] [\[13\]][ref-13] [\[15\]][ref-15] [\[17\]][ref-17]

**Math is almost never rendered in the terminal.** Five of the six source-researchable terminal renderers (Claude Code, Codex, OpenCode's TUI, Kimi Code, KimiX) pass LaTeX through as raw text — none tokenize `$…$`/`$$…$$` or enable a math extension. KaTeX appears only in **web/GUI** packages (OpenCode `session-ui`/`ui`/`web`, Kimi's `kimi-web`), never in a terminal. [\[4\]][ref-4] [\[13\]][ref-13] [\[14\]][ref-14] [\[15\]][ref-15] [\[16\]][ref-16] [\[17\]][ref-17]

**Gemini CLI is the sole exception, and it implements almost exactly the approach KQode is planning:** a `latexToUnicode` post-processor that converts LaTeX to terminal Unicode, with **precision-first `$` detection** — inline `$…$` is treated as math only when the inner text contains a LaTeX marker (`\command`, `_`, `^`) or is a single variable, so currency (`$5.99`, `$5 to $10`) and shell variables (`$USER $HOME`) are left intact. The conversion runs **before** markdown tokenization, masking inline-code spans and URLs so they stay verbatim. [\[7\]][ref-7] [\[8\]][ref-8] [\[9\]][ref-9] [\[10\]][ref-10]

Status is `partial`: GitHub Copilot CLI's public repo is docs-only (no renderable source), and OpenCode's markdown/highlight logic lives in its external `opentui` dependency (not vendored in-repo).

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| copilot-cli | https://github.com/github/copilot-cli | https://github.com/github/copilot-cli | main | 6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc | partial (no_evidence) | Public repo is docs-only: README, changelog, install.sh, LICENSE — 0 source files. |
| claude-code | docs/claude-code (local mirror) | n/a | n/a | n/a | complete | Source-map snapshot; provenance 2026-03-31 per `docs/claude-code/CLAUDE.md`; no upstream commit SHA. |
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 385c0a9351e2199929e01f7864ec78a8f7d5e580 | complete |  |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | f354eebaf43b25bacb176007e449bb9a638fd101 | complete |  |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 9976269ab1accfc9f9dc98a4a688c516934de422 | partial (partial_trace) | TUI is TypeScript (`opentui`); markdown/highlight logic is in the external `opentui` dep, not in-repo. |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd | complete |  |
| kimix | https://github.com/Sikao-Engine/KimiX | https://github.com/Sikao-Engine/KimiX | master | 1fe7256990ba51e2607ccfc53b4c7a09cb748f0f | complete |  |

---

## Method

- Question: How do reference coding agents render code blocks and math (LaTeX) in the terminal?
- Repo scope: default scope (7 repos).
- Approach: shallow-cloned the 6 git repos to a temp cache outside the repository, read the git-ignored Claude Code mirror in place, then located renderers via dependency manifests + targeted search, and read the specific render/highlight/math modules.
- Safety posture: read/search only; no reference code was run, built, installed, or tested; reference instruction files (including the mirror's `CLAUDE.md`) were treated as data, not active instructions.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs (or internal repo-relative links for the Claude Code mirror) behind compact `code` links.

---

## Per-Repo Findings

### Claude Code (local mirror)

**Status:** complete

**Observed behavior**

- Markdown is parsed with `marked` and rendered by a recursive `formatToken` switch that applies `chalk` ANSI styles; it handles headings, lists, tables, links, blockquotes, `codespan`, etc. Strikethrough parsing is deliberately **disabled** because "the model often uses `~` for approximate (e.g. `~100`)." [\[1\]][ref-1]
- Fenced code blocks route to `cli-highlight` (which wraps `highlight.js`), falling back to plaintext when the language is unsupported. [\[2\]][ref-2] [\[3\]][ref-3]
- There is **no math/LaTeX token case** anywhere in the renderer, so `$…$`, `$$…$$`, `\[…\]`, `\begin{aligned}`, `\boxed{}` fall through as literal `text` — rendered raw. [\[1\]][ref-1]
- A separate native `ColorFile` highlighter is used for structured diffs/file reads (line-number gutters), distinct from the markdown code-fence path. [\[2\]][ref-2]

### Codex CLI

**Status:** complete

**Observed behavior**

- The TUI renders markdown with `pulldown-cmark`, enabling only `ENABLE_STRIKETHROUGH` and `ENABLE_TABLES`. It does **not** enable `pulldown-cmark`'s math option, so `$`-delimited math is parsed as plain text. [\[4\]][ref-4]
- Fenced code is buffered per block and syntax-highlighted via `syntect` + the `two-face` grammar/theme bundles, converted to `ratatui` spans. [\[5\]][ref-5] [\[6\]][ref-6]
- No `katex`/`latex`/math handling exists in the TUI crate — math is shown raw. [\[4\]][ref-4]

### Gemini CLI

**Status:** complete

**Observed behavior**

- **Gemini CLI converts LaTeX to Unicode for the terminal.** `latexToUnicode.ts` is documented as "a conservative, lossy post-processor" that turns LaTeX in model output into terminal-friendly Unicode and "leaves anything it does not recognise untouched, so … Windows paths, regex examples … [are] not mangled." It ships frozen `GREEK_LETTERS` and `LATEX_COMMANDS` maps plus sub/superscript handling. [\[7\]][ref-7]
- **Precision-first `$` detection:** display `$$…$$` is always converted; inline `$…$` is converted only when the inner text contains a LaTeX marker (`\command`, `_`, `^`) or is a single letter. Currency (`$5.99`, `$5 to $10`) and shell variables (`$USER $HOME`) are left intact. Unit tests assert exactly this behavior (including `\alphabet` not converting via word boundary). [\[8\]][ref-8] [\[9\]][ref-9]
- The LaTeX pass runs **before** markdown tokenization and masks inline-code spans and bare URLs with a private-use sentinel so their contents stay verbatim (a code span's `$\to$` is preserved). [\[10\]][ref-10]
- Fenced code is highlighted with `lowlight` (`highlight.js`); the block layer (`MarkdownDisplay.tsx`) is a custom line-based regex renderer, and `marked` is a dependency in `core`. [\[11\]][ref-11] [\[12\]][ref-12]

### OpenCode

**Status:** partial (`partial_trace`)

**Observed behavior**

- The TUI is **TypeScript** (built on `opentui`); there is no Go module in the tree. `opentui`'s built-in parsers render markdown, and code is highlighted with tree-sitter WASM grammars (Python/Rust/Go/C++/C#…) wired from nvim-treesitter queries. [\[13\]][ref-13]
- KaTeX support (`marked-katex-extension`, `katex`, `shiki`) exists only in the **web/GUI** packages (`session-ui`, `ui`, `web`, `app`), not in `packages/tui`. The terminal has no math rendering. [\[14\]][ref-14]

**Evidence gaps**

- The actual markdown/highlight rendering runs inside the external `opentui` dependency, which is not vendored in-repo; only the TUI's parser wiring and the absence of KaTeX were confirmed from source. [\[13\]][ref-13]

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- The `pi-tui` terminal component parses markdown with `marked`'s lexer and renders tokens with a custom renderer; code-fence highlighting is injected via a `highlightCode(code, lang)` theme hook, and the app wires `cli-highlight`. [\[15\]][ref-15] [\[16\]][ref-16]
- No math handling exists in `pi-tui`; `katex` (and `shiki`) appear only in the **web** app (`kimi-web`). Terminal math is raw. [\[15\]][ref-15] [\[16\]][ref-16]

### KimiX

**Status:** complete

**Observed behavior**

- The Python CLI renders markdown with a **hand-rolled regex ANSI pass** (`cli_impl/utils.py`): headings, ordered/unordered/task lists, blockquotes, HR, code fences, tables, plus inline bold/italic/inline-code — no parser library, and no math handling. [\[17\]][ref-17]
- The separate TypeScript DOM app uses `marked` (`new Marked({ gfm: true })`) with no `katex` dependency. Neither surface renders math. [\[18\]][ref-18]

### GitHub Copilot CLI

**Status:** partial (`no_evidence`)

**Observed behavior**

- The public `github/copilot-cli` repo contains only distribution/docs artifacts (README, changelog, `install.sh`, LICENSE) and **0 TypeScript/JavaScript source files**, so its terminal rendering internals cannot be researched from source. [\[19\]][ref-19]

---

## Cross-Repo Comparison

| Dimension | Copilot CLI | Claude Code | Codex | Gemini CLI | OpenCode (TUI) | Kimi Code | KimiX | Confidence |
|---|---|---|---|---|---|---|---|---|
| Markdown parser | not researchable | `marked` [\[1\]][ref-1] | `pulldown-cmark` [\[4\]][ref-4] | custom regex + `marked` (core) [\[11\]][ref-11] | `opentui` built-in [\[13\]][ref-13] | `marked` lexer [\[15\]][ref-15] | custom regex (Py) [\[17\]][ref-17] | high (6/7) |
| Code-block highlighting | not researchable | `cli-highlight`/`highlight.js` [\[2\]][ref-2] | `syntect` + `two-face` [\[5\]][ref-5] | `lowlight`/`highlight.js` [\[11\]][ref-11] | tree-sitter grammars [\[13\]][ref-13] | injected `cli-highlight` [\[15\]][ref-15] | regex ANSI [\[17\]][ref-17] | high |
| Math / LaTeX in terminal | not researchable | raw (no case) [\[1\]][ref-1] | raw (math opt off) [\[4\]][ref-4] | **LaTeX→Unicode** [\[7\]][ref-7] | raw [\[13\]][ref-13] | raw [\[15\]][ref-15] | raw [\[17\]][ref-17] | high |
| KaTeX anywhere | not researchable | none | none | none | web/GUI only [\[14\]][ref-14] | web only (`kimi-web`) [\[16\]][ref-16] | none | high |
| Model-quirk tuning | not researchable | disables `~` strikethrough [\[1\]][ref-1] | — | mask code/URLs; convert-before-tokenize [\[10\]][ref-10] | — | — | — | partial |

---

## KQode Lessons

### Product behavior

- **Terminal LaTeX→Unicode is a proven, shippable pattern, not a novel bet.** Gemini CLI already does exactly what the KQode brainstorm proposes (readable Unicode, not typeset images), which de-risks the direction. [\[7\]][ref-7] [\[8\]][ref-8]
- **Precision-first `$` detection is the established design.** Gemini converts `$…$` only on a LaTeX marker (`\`, `_`, `^`) or single-variable, and preserves currency/shell `$` — matching KQode's chosen failure mode. Adopt the same stance. [\[8\]][ref-8] [\[9\]][ref-9]
- **Raw LaTeX is the universal floor**, so KQode's math pass is a clear differentiator: 5 of 6 researchable terminals show math raw, and users already tolerate that baseline. [\[4\]][ref-4] [\[13\]][ref-13] [\[15\]][ref-15] [\[17\]][ref-17]
- **Renderers tune markdown for model output quirks** (Claude Code disables `~` strikethrough). Worth a KQode backlog note beyond math. [\[1\]][ref-1]

### Architecture implications

- **Convert LaTeX before markdown tokenization, and mask code spans + URLs first.** Gemini's ordering prevents `_`/`^`/`$` inside math or code from being mis-parsed as italic/formatting — directly applicable to KQode's `marked` pipeline (`tui/src/libs/markdown/`). [\[10\]][ref-10]
- **Keep the math pass display-only; raw LaTeX stays the stored truth.** Every repo approximates only at render time — reinforces KQode's decision to leave the JSONL transcript untouched. [\[7\]][ref-7] [\[10\]][ref-10]
- **Math belongs on rich/web surfaces via KaTeX, never the terminal.** OpenCode and Kimi both gate KaTeX to web/GUI packages — reinforces "no terminal image typesetting." [\[14\]][ref-14] [\[16\]][ref-16]
- **Code highlighting is already solved everywhere and engine choice varies; KQode's existing highlight path needs no change** for this work. [\[2\]][ref-2] [\[5\]][ref-5] [\[13\]][ref-13]

### Evaluation ideas

- **Seed KQode golden cases from Gemini's LaTeX test corpus shape** (implement independently): `$5.99`, `$5 to $10`, `$USER $HOME` must pass through unchanged; `$\alpha$` → `α`, `$$\alpha+\beta$$` → `α + β`, `\alphabet` stays literal. Deterministic and high-signal for the precision decision. [\[9\]][ref-9]

### Risks and tradeoffs

- **Do not copy or port Gemini's source.** The research skill's no-copy rule stands; study the behavior and design, implement KQode's own converter. [\[7\]][ref-7]
- **Unicode sub/superscript and structure coverage is inherently partial; adopt a lossy-but-safe posture.** Gemini leaves unknown `\foo` untouched so Windows paths/regex survive — KQode's structural layer should do the same rather than aggressively rewriting. [\[7\]][ref-7] [\[8\]][ref-8]
- **Keep the structural regexes bounded.** Gemini limits brace handling to a single nesting level explicitly to avoid catastrophic backtracking on adversarial model output — a correctness/DoS consideration for KQode's `\boxed`/`\frac`/`\text` handling. [\[8\]][ref-8]

---

## Evidence Gaps

- **copilot-cli** (`no_evidence`): public repo is docs-only; terminal rendering internals are not researchable from source. [\[19\]][ref-19]
- **opencode** (`partial_trace`): markdown/highlight rendering is implemented in the external `opentui` dependency, not vendored in-repo; only the TUI wiring and KaTeX-absence were confirmed. [\[13\]][ref-13]
- **claude-code**: evidence is from a 2026-03-31 source-map snapshot (no upstream commit SHA), which may lag the current product.
- Reads focused on math + code-fence handling per the question; full end-to-end renderer behavior (wrapping, streaming) was not exhaustively traced.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Claude Code (local mirror): `marked` + `formatToken` renderer; strikethrough disabled for model `~` usage ([code](../claude-code/utils/markdown.ts#L21-L46)).
- <a id="ref-2"></a>[2] Claude Code (local mirror): fenced code → `cli-highlight` highlight, plaintext fallback ([code](../claude-code/utils/markdown.ts#L72-L86)).
- <a id="ref-3"></a>[3] Claude Code (local mirror): `cli-highlight` wraps `highlight.js` ([code](../claude-code/utils/cliHighlight.ts#L10-L30)).
- <a id="ref-4"></a>[4] Codex CLI: `pulldown-cmark` options enable strikethrough + tables only (no math option) ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/tui/src/markdown_render.rs#L323-L325)).
- <a id="ref-5"></a>[5] Codex CLI: fenced code buffered then syntax-highlighted via `highlight_code_to_lines` ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/tui/src/markdown_render.rs#L847-L853)).
- <a id="ref-6"></a>[6] Codex CLI: highlighter wraps `syntect` + `two-face` grammar/theme bundles ([code](https://github.com/openai/codex/blob/385c0a9351e2199929e01f7864ec78a8f7d5e580/codex-rs/tui/src/render/highlight.rs#L1-L4)).
- <a id="ref-7"></a>[7] Gemini CLI: `latexToUnicode.ts` — conservative LaTeX→Unicode post-processor with Greek/command maps ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/utils/latexToUnicode.ts#L7-L24)).
- <a id="ref-8"></a>[8] Gemini CLI: `stripMathDelimiters` — precision-first `$` heuristic (LaTeX-marker or single-variable; currency/shell preserved) ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/utils/latexToUnicode.ts#L344-L378)).
- <a id="ref-9"></a>[9] Gemini CLI: `latexToUnicode.test.ts` — asserts `$5.99`/`$5 to $10`/`$USER $HOME` preserved, `$\alpha$`/`$$\alpha+\beta$$` converted, `\alphabet` literal ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/utils/latexToUnicode.test.ts#L43-L96)).
- <a id="ref-10"></a>[10] Gemini CLI: `markdownParsingUtils.ts` — mask code spans/URLs, convert LaTeX before markdown tokenization ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/utils/markdownParsingUtils.ts#L77-L118)).
- <a id="ref-11"></a>[11] Gemini CLI: `CodeColorizer.tsx` uses `lowlight` (`highlight.js`) for fenced code ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/src/ui/utils/CodeColorizer.tsx#L9-L28)).
- <a id="ref-12"></a>[12] Gemini CLI: manifests — `lowlight`/`highlight.js` in `cli`, `marked` in `core` ([code](https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/packages/cli/package.json#L51-L56)).
- <a id="ref-13"></a>[13] OpenCode: TUI parser config — `opentui` built-in markdown parser + tree-sitter WASM grammars ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/tui/src/parsers-config.ts#L1-L20)).
- <a id="ref-14"></a>[14] OpenCode: `marked-katex-extension`/`katex` only in web/GUI packages, not the TUI ([code](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/packages/session-ui/package.json#L53-L57)).
- <a id="ref-15"></a>[15] Kimi Code: `pi-tui` markdown component — `marked` lexer + custom renderer + injected `highlightCode` ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/packages/pi-tui/src/components/markdown.ts#L1-L50)).
- <a id="ref-16"></a>[16] Kimi Code: manifests — `cli-highlight` in the CLI app; `katex`/`shiki` only in `kimi-web` ([code](https://github.com/moonshotai/kimi-code/blob/2f97917bb5edc8bdb9837724e57a88f5c0e1f2bd/apps/kimi-web/package.json#L21-L24)).
- <a id="ref-17"></a>[17] KimiX: Python CLI hand-rolled regex ANSI markdown renderer (no parser lib, no math) ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/src/kimix/cli_impl/utils.py#L295-L390)).
- <a id="ref-18"></a>[18] KimiX: TS DOM app uses `marked` (gfm), no `katex` ([code](https://github.com/Sikao-Engine/KimiX/blob/1fe7256990ba51e2607ccfc53b4c7a09cb748f0f/src/app/src/markdown.ts#L1-L20)).
- <a id="ref-19"></a>[19] GitHub Copilot CLI: public repo is docs-only (README/changelog/install.sh; no source) ([code](https://github.com/github/copilot-cli/tree/6a8b92eb355bee48b731ddb2d6ab5f12c3bf50fc)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
[ref-9]: #ref-9
[ref-10]: #ref-10
[ref-11]: #ref-11
[ref-12]: #ref-12
[ref-13]: #ref-13
[ref-14]: #ref-14
[ref-15]: #ref-15
[ref-16]: #ref-16
[ref-17]: #ref-17
[ref-18]: #ref-18
[ref-19]: #ref-19
