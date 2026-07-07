---
date: 2026-07-07
topic: ink-composer-rendering
question: "Why can KQode show a first-typing right-edge composer artifact, and how do reference coding agents that use Ink handle terminal-edge composer rendering?"
status: partial
---

# Ink Composer Rendering and Terminal Edge Artifacts

## Summary

KQode's reported one-cell right-edge artifact was most plausibly caused by the pre-fix local combination of exact fullscreen Ink rendering, final-column painting, and a composer row that hand-padded text to the terminal width. At the time of this investigation, KQode intentionally set `FULLSCREEN_GUARD_ROWS = 0`, documented that this made Ink take the fullscreen clear/repaint path, and painted composer half-line blocks, padded input rows, and the status bar through `columns`.

Among the default reference repositories, Gemini CLI is the only directly comparable Ink-based terminal agent. Gemini still uses Ink alternate-buffer rendering, but it leaves a bottom padding row in alternate-buffer mode, computes an input width smaller than the containing frame, and keeps the editable text inside a framed half-line wrapper rather than making the input text row itself own every terminal column. [\[1\]][ref-1] [\[2\]][ref-2] [\[3\]][ref-3] [\[4\]][ref-4]

The non-Ink references avoid this class through different renderers: Codex uses ratatui/crossterm, OpenCode uses OpenTUI/Solid, Aider uses prompt_toolkit/Rich, SWE-agent uses Rich for progress UI, and Kimi Code uses a custom renderer that explicitly pads background lines and clears changed terminal lines with `ESC[2K` inside synchronized output. [\[5\]][ref-5] [\[6\]][ref-6] [\[7\]][ref-7] [\[8\]][ref-8] [\[9\]][ref-9] [\[10\]][ref-10]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 831c14fc39f7810703263c31a4a712842dba35f4 | complete | Not Ink; Rust ratatui/crossterm TUI. |
| aider | https://github.com/Aider-AI/aider | https://github.com/Aider-AI/aider | main | 5dc9490bb35f9729ef2c95d00a19ccd30c26339c | complete | Not Ink; prompt_toolkit/Rich CLI. |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 9353559088fcb81d02290707e2da2e79d31b9bdc | complete | Not Ink; OpenTUI/Solid TUI. |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 4aeb33637f8c707ff21198fb59185929a4334f47 | complete | Not Ink; custom `pi-tui` renderer. |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | 15a9429b69bd4c72514678ac17c88087f7ab9d48 | complete | Main comparable Ink evidence. |
| swe-agent | https://github.com/SWE-agent/SWE-agent | https://github.com/SWE-agent/SWE-agent | main | 0363b9ef787a667d96120e132e8d3d59a692adcd | complete | Not Ink; Rich progress UI evidence only. |

---

## Method

- Question: Why can KQode show a first-typing right-edge composer artifact, and how do reference coding agents that use Ink handle terminal-edge composer rendering?
- Repo scope: default first-scope repositories.
- Safety posture: read/search only; no code execution; reference instructions treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### Gemini CLI

**Status:** complete

**Observed behavior**

- Gemini enters Ink alternate-buffer mode conditionally, passes `alternateBuffer`, `terminalBuffer`, and `incrementalRendering` to Ink's `render()`, and disables line wrapping while alternate-buffer mode is active. [\[1\]][ref-1]
- In its default layout, Gemini sets the root box to terminal width and alternate-buffer terminal height, but also applies `paddingBottom={1}` in alternate-buffer mode, explicitly leaving room at the bottom rather than filling every terminal row with app content. [\[2\]][ref-2]
- Gemini computes the prompt input width by subtracting frame padding, border, and prompt-prefix overhead from the main content width, so the editable text area is narrower than its container. [\[3\]][ref-3]
- Gemini wraps the input in `HalfLinePaddedBox`, whose wrapper spans `terminalWidth`, but the editable row is a padded inner `Box`; for non-empty input it renders a scrollable list at `inputWidth + SCROLLBAR_GUTTER_WIDTH` rather than manually padding the prompt text itself to the terminal's final column. [\[4\]][ref-4]
- Gemini's text cursor is owned by the input text node using `terminalCursorFocus` and `terminalCursorPosition`, with an inverse-space visual at end-of-line, instead of using a separately measured global `useCursor().setCursorPosition` call for the composer row. [\[11\]][ref-11]

**Evidence gaps**

- Only Gemini in the default scope is an Ink-based terminal agent with directly comparable prompt-composer rendering.

### Kimi Code

**Status:** complete

**Observed behavior**

- Kimi Code's `pi-tui` box component renders child lines into a fixed width, pads each line by measured visible width, and then applies the background function to the padded line. [\[8\]][ref-8]
- Its renderer computes changed line ranges, wraps updates in synchronized output, clears each changed line with `ESC[2K`, and clears surplus old lines when content shrinks. This gives Kimi explicit ownership of terminal erasure rather than relying on Ink's row diffing. [\[9\]][ref-9]
- The terminal abstraction exposes direct `clearLine`, `clearFromCursor`, and `clearScreen` escape writes, reinforcing that this renderer controls low-level terminal cleanup itself. [\[10\]][ref-10]

**Evidence gaps**

- Kimi Code is useful as a renderer contrast, not as an Ink comparison.

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode's TUI package depends on `@opentui/core`, `@opentui/keymap`, `@opentui/solid`, and `solid-js`, not Ink. [\[7\]][ref-7]

**Evidence gaps**

- No Ink composer-rendering pattern was found in the selected OpenCode TUI package.

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex's TUI crate depends on `crossterm` and `ratatui`, including crossterm bracketed paste/event-stream support and ratatui rendering features. [\[5\]][ref-5]

**Evidence gaps**

- Not an Ink-based comparison.

### Aider

**Status:** complete

**Observed behavior**

- Aider's requirements list `rich` and `prompt_toolkit`, which points to Python terminal input/output tooling rather than Ink. [\[6\]][ref-6]

**Evidence gaps**

- Not an Ink-based comparison.

### SWE-agent

**Status:** complete

**Observed behavior**

- SWE-agent's batch progress UI imports Rich console, progress, and table components. [\[12\]][ref-12]

**Evidence gaps**

- Not an Ink-based comparison.

---

## Cross-Repo Comparison

| Dimension | Codex | Aider | OpenCode | Kimi Code | Gemini CLI | SWE-agent | Confidence |
|---|---|---|---|---|---|---|---|
| Ink usage | Not Ink; ratatui/crossterm. [\[5\]][ref-5] | Not Ink; prompt_toolkit/Rich. [\[6\]][ref-6] | Not Ink; OpenTUI/Solid. [\[7\]][ref-7] | Not Ink; custom renderer. [\[8\]][ref-8] [\[9\]][ref-9] | Ink-based terminal UI. [\[1\]][ref-1] | Not Ink; Rich progress UI. [\[12\]][ref-12] | high |
| Terminal-edge strategy | Delegated to ratatui/crossterm backend. [\[5\]][ref-5] | Delegated to prompt_toolkit/Rich. [\[6\]][ref-6] | Delegated to OpenTUI runtime. [\[7\]][ref-7] | Explicit width padding plus `ESC[2K` line clearing. [\[8\]][ref-8] [\[9\]][ref-9] | Alternate buffer with a bottom padding row and narrower input width inside a full-width wrapper. [\[2\]][ref-2] [\[3\]][ref-3] [\[4\]][ref-4] | Not comparable for prompt composer. [\[12\]][ref-12] | partial |
| Cursor strategy | Not investigated for this question. | Not investigated for this question. | Not investigated for this question. | Hardware cursor positioned by custom renderer after frame writes. [\[9\]][ref-9] | Cursor placed inside the rendered text node using Ink terminal cursor props. [\[11\]][ref-11] | Not applicable. | partial |

---

## KQode Lessons

### Product behavior

- If KQode prioritizes artifact-free typing, the most reference-aligned Ink choice is to stop treating edge-to-edge fill as absolute. Gemini leaves a bottom row in alternate-buffer mode while preserving a polished framed composer. [\[2\]][ref-2] [\[4\]][ref-4]

### Architecture implications

- KQode should choose one owner for terminal-edge cleanup. Either stay in Ink's safer incremental path with guard rows/columns, or move toward Kimi-style explicit clearing and synchronized output; mixing fullscreen Ink diffing with manual full-width row padding is the risky middle. [\[1\]][ref-1] [\[8\]][ref-8] [\[9\]][ref-9]
- For the composer, prefer a framed full-width wrapper with a narrower editable text area over padding the editable text row itself to the terminal's final column. Gemini separates container width from input width with `calculatePromptWidths`. [\[3\]][ref-3] [\[4\]][ref-4]
- The cursor should be re-evaluated alongside row/column guards. Gemini uses Ink cursor props on the text node; KQode currently uses a measured global cursor placement path, so a visual cleanup should test cursor placement explicitly. [\[11\]][ref-11]

### Evaluation ideas

- Add snapshot or integration cases for the first typed character after startup, after a help-surface round trip, and after resizing. These cases should assert the final composer cell and cursor row because Gemini and Kimi both encode terminal-edge behavior as first-class rendering concerns. [\[2\]][ref-2] [\[9\]][ref-9]

### Risks and tradeoffs

- A one-row or one-column guard is visually less tight but aligns with Gemini's stability-first alternate-buffer layout. Full edge-to-edge fill is possible, but the Kimi evidence suggests it needs explicit low-level line clearing rather than relying on Ink's normal reconciliation. [\[2\]][ref-2] [\[8\]][ref-8] [\[9\]][ref-9]

---

## Evidence Gaps

- Only Gemini CLI in the default first-scope set is a direct Ink comparison.
- This report did not run any reference code or reproduce terminal behavior in the reference repos; it only inspected source-level rendering strategies.
- The exact terminal/Ink condition that leaves KQode's first typed character artifact still needs local reproduction and a focused KQode fix.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Gemini CLI: Ink render setup uses alternate buffer, terminal buffer, incremental rendering, mouse setup, and line-wrapping disablement ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/interactiveCli.tsx#L69-L178)).
- <a id="ref-2"></a>[2] Gemini CLI: default layout uses terminal width/height and applies `paddingBottom={1}` in alternate-buffer mode ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/layouts/DefaultAppLayout.tsx#L27-L40)).
- <a id="ref-3"></a>[3] Gemini CLI: prompt widths subtract frame padding, border, and prefix overhead from main content width ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/components/InputPrompt.tsx#L141-L154)).
- <a id="ref-4"></a>[4] Gemini CLI: input prompt renders a half-line padded wrapper, inner padded row, and scrollable input at `inputWidth + SCROLLBAR_GUTTER_WIDTH` ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/components/InputPrompt.tsx#L1795-L1915)).
- <a id="ref-5"></a>[5] Codex CLI: TUI crate depends on crossterm and ratatui rather than Ink ([code](https://github.com/openai/codex/blob/831c14fc39f7810703263c31a4a712842dba35f4/codex-rs/tui/Cargo.toml#L71-L88)).
- <a id="ref-6"></a>[6] Aider: CLI requirements include Rich and prompt_toolkit rather than Ink ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/requirements/requirements.in#L1-L7)).
- <a id="ref-7"></a>[7] OpenCode: TUI package depends on OpenTUI and Solid rather than Ink ([code](https://github.com/anomalyco/opencode/blob/9353559088fcb81d02290707e2da2e79d31b9bdc/packages/tui/package.json#L50-L66)).
- <a id="ref-8"></a>[8] Kimi Code: custom `pi-tui` box pads each rendered line to measured width and applies background styling ([code](https://github.com/moonshotai/kimi-code/blob/4aeb33637f8c707ff21198fb59185929a4334f47/packages/pi-tui/src/components/box.ts#L74-L136)).
- <a id="ref-9"></a>[9] Kimi Code: custom renderer computes changed ranges, wraps output in synchronized updates, and clears changed/extra lines with `ESC[2K` ([code](https://github.com/moonshotai/kimi-code/blob/4aeb33637f8c707ff21198fb59185929a4334f47/packages/pi-tui/src/tui.ts#L1477-L1566)).
- <a id="ref-10"></a>[10] Kimi Code: terminal abstraction exposes direct clear-line/from-cursor/screen escape writes ([code](https://github.com/moonshotai/kimi-code/blob/4aeb33637f8c707ff21198fb59185929a4334f47/packages/pi-tui/src/terminal.ts#L492-L502)).
- <a id="ref-11"></a>[11] Gemini CLI: input prompt places the terminal cursor inside the text node with `terminalCursorFocus` and `terminalCursorPosition` ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/components/InputPrompt.tsx#L1600-L1668)).
- <a id="ref-12"></a>[12] SWE-agent: progress UI imports Rich console/progress/table components ([code](https://github.com/SWE-agent/SWE-agent/blob/0363b9ef787a667d96120e132e8d3d59a692adcd/sweagent/run/_progress.py#L1-L20)).

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
