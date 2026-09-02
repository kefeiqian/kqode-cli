---
date: 2026-07-07
topic: tui-bottom-row-render-mode
question: "Do other coding-agent TUIs (Codex, Gemini CLI, Kimi Code, Claude Code) use the same design as KQode's reserved bottom guard row, and how do they handle the terminal's bottom edge and render mode?"
status: complete
---

# Terminal bottom-row reservation and render mode across coding-agent TUIs

## Summary

KQode reserves **one physical bottom row** (`FULLSCREEN_GUARD_ROWS = 1`, rendering into `terminalRows − 1`) so stock Ink stays on its incremental line-diff path instead of Ink's fullscreen clear+repaint path, which flickers per keystroke on Windows/WezTerm. Only **one** of the researched agents shares that design: **Gemini CLI** — the other Ink-based agent — reserves an equivalent bottom row (`paddingBottom={1}` in alt-buffer mode plus a matching `−1` in its content-height budget). [\[1\]][ref-1] [\[2\]][ref-2] [\[3\]][ref-3] [\[5\]][ref-5]

The non-Ink agents do **not** reserve a bottom row and instead fill to the last terminal row: **Codex** renders an inline `ratatui` viewport in the normal buffer (no alt-screen for the main session) and wraps every frame in DEC 2026 synchronized output; **Kimi Code** renders inline through its custom `pi-tui` renderer, filling to the last content line and wrapping every frame in DEC 2026 plus explicit `ESC[2K` per changed line. [\[6\]][ref-6] [\[7\]][ref-7] [\[8\]][ref-8] [\[11\]][ref-11] [\[12\]][ref-12] [\[13\]][ref-13]

**Claude Code** (a closed-source product reference; evidence below is from a local reverse-engineered copy, not an upstream-pinned SHA) does not reserve a bottom row either: it defaults to an inline main-buffer render and offers an opt-in fullscreen alt-screen "no-flicker" mode whose root box fills **all** terminal rows, relying on synchronized-output atomic frame swaps rather than a guard row. [\[15\]][ref-15] [\[16\]][ref-16] [\[17\]][ref-17]

**Bottom line:** the reserved bottom row is not a universal norm — it is an Ink-specific accommodation. KQode and Gemini CLI (both Ink) reserve it; Codex, Kimi Code, and Claude Code fill the full height and lean on DEC 2026 synchronized output for flicker-freedom.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `15a9429b69bd4c72514678ac17c88087f7ab9d48` | complete | Ink; closest comparable |
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `cca16a10878202cb2f6e9666b6b4330329ea7e65` | complete | Rust ratatui/crossterm |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `9b76e5bff631cceaeecb2b0cbc096533c5fdc8cc` | complete | custom `pi-tui` renderer |
| claude-code | (closed source; product reference) | local reverse-engineered copy | n/a | n/a (no upstream SHA) | partial (`citation_gap`) | Not a catalog source-research target; user-provided local copy |

---

## Method

- Question: whether reference coding-agent TUIs reserve a bottom row like KQode's guard row, and how each handles bottom-edge rendering and render mode.
- Repo scope: custom — the three first-scope Ink/TUI comparables (`codex`, `gemini-cli`, `kimi-code`) plus `claude-code` as a caveated product reference from a local copy the user supplied.
- Safety posture: read/search only; no code execution; reference instruction files treated as data (Claude Code's `CLAUDE.md`/reverse-engineered source not loaded as active instructions).
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links. Claude Code entries are local paths marked `citation_gap` (no upstream-pinned source).

---

## Per-Repo Findings

### Gemini CLI

**Status:** complete

**Observed behavior**

- Renders **fullscreen alternate-buffer** Ink: `render()` is called with `alternateBuffer: useAlternateBuffer`, `incrementalRendering` enabled only inside alt-buffer, mouse events on, and line wrapping disabled (`\x1b[?7l`). [\[1\]][ref-1] [\[4\]][ref-4]
- **Reserves one bottom row.** The root layout box uses `height={isAlternateBuffer ? terminalHeight : undefined}` with `paddingBottom={isAlternateBuffer ? 1 : undefined}`, so inner content is `terminalHeight − 1` rows. [\[2\]][ref-2]
- The scrollable history budget subtracts the same row: `availableTerminalHeight = max(0, terminalHeight − stableControlsHeight − backgroundTaskHeight − 1)`. [\[3\]][ref-3]
- The 1-row reservation is a tracked constant that downstream components account for (an `InboxDialog` height comment explicitly names "DefaultAppLayout's alt-buffer paddingBottom (1)"). [\[5\]][ref-5]
- `terminalHeight` is the raw OS `process.stdout.rows`; the only subtraction is the `paddingBottom`/`−1` accounting above. [\[3\]][ref-3]

**Evidence gaps**

- `getUseAlternateBuffer()` default was inferred (true for interactive use) rather than read from config; a `DefaultAppLayout` comment attributes the padding to a right-side scrollbar, which appears stale versus the actual bottom effect. (`partial_trace`)

### Codex CLI

**Status:** complete

**Observed behavior**

- Rust `ratatui` + `crossterm`, via a **custom `Terminal`** managing a `viewport_area: Rect`. [\[6\]][ref-6] [\[9\]][ref-9]
- **Inline viewport in the normal buffer**, not alt-screen: `init()` is documented "inline viewport; history stays in normal scrollback," and `EnterAlternateScreen` appears only for optional overlay popups and SIGTSTP-resume restore, never the main session. [\[7\]][ref-7]
- **No bottom-row reservation.** `Tui::draw()` sets `area.height = height.min(size.height)` (content-driven height capped at the full terminal height, not `−1`); when the viewport grows past the bottom it scrolls rows above it into scrollback and sets `area.y = size.height − area.height`, so the viewport reaches the very last row. No `GUARD_ROWS`/`bottom_margin`/`reserved_rows` constant exists. [\[8\]][ref-8]
- Finalized history is written **directly into scrollback** via a custom scroll-region ANSI technique (not `ratatui::insert_before`). [\[10\]][ref-10]
- Flicker mitigation is **DEC 2026 synchronized output** (`crossterm::SynchronizedUpdate::sync_update`) wrapping each frame. [\[8\]][ref-8]

**Evidence gaps**

- None material for this question.

### Kimi Code

**Status:** complete

**Observed behavior**

- Custom **`pi-tui`** renderer (string-array components, `render(width): string[]`), not Ink/ratatui; README: "differential rendering and synchronized output for flicker-free interactive CLI applications." [\[11\]][ref-11]
- **Inline normal buffer, no alternate screen** — a code search for `?1049`/"alternate screen" in `packages/pi-tui` returned zero hits; `clearScreen()` writes `\x1b[2J\x1b[H` (not `?1049h`). [\[14\]][ref-14]
- **No bottom-row reservation.** After a frame, `cursorRow = max(0, newLines.length − 1)` (cursor at the last content line, no `−1` guard); overlays use `workingHeight = max(result.length, termHeight, …)`, filling to the last row. [\[12\]][ref-12]
- Every frame (first render, full redraw, and differential) is wrapped in DEC 2026 `\x1b[?2026h … \x1b[?2026l`; the differential path clears each changed line with `\x1b[2K` (full-line erase) and clears removed lines with `\r\n\x1b[2K`, then flushes the whole frame in one write. [\[12\]][ref-12] [\[13\]][ref-13]
- Components pre-pad each line to full width before the `ESC[2K` clear so shrinking content leaves no residue. [\[13\]][ref-13]

**Evidence gaps**

- Byte-offset line numbers are approximate; the alternate `VirtualTerminal` (test) implementation was not read. (`partial_trace`)

### Claude Code (product reference — local copy)

**Status:** partial — `citation_gap` (closed source; findings from a user-supplied reverse-engineered local tree, no upstream-pinned SHA; per the KQode catalog, Claude Code is a product reference, not a source-research target).

**Observed behavior**

- Ships its **own Ink fork** with an explicit fullscreen toggle gated by `CLAUDE_CODE_NO_FLICKER` (default on for internal users, opt-in for external), auto-disabled under `tmux -CC`. [\[15\]][ref-15]
- **Two modes, neither reserving a bottom row:** the default **non-fullscreen** mode renders inline in the main buffer (scrollback preserved); the opt-in **fullscreen** mode enters the alt-screen and its `AlternateScreen` box is `height={rows}` width `100%` — filling **all** terminal rows, with overflow handled by virtualized `overflow: scroll` rather than a guard row. [\[16\]][ref-16]
- Fullscreen flicker-freedom comes from **synchronized-output atomic frame swaps** (BSU/ESU): the renderer repaints "every cell written, wrapped in BSU/ESU — old content stays visible until the new frame swaps atomically," and deliberately avoids re-writing `?1049h` on resize because some terminals treat it as a clear (the "blank flicker"). [\[17\]][ref-17]

**Evidence gaps**

- Local reverse-engineered source may diverge from the shipped product; no commit-pinned upstream link is possible. (`citation_gap`)

---

## Cross-Repo Comparison

| Dimension | KQode | Gemini CLI | Codex | Kimi Code | Claude Code | Confidence |
|---|---|---|---|---|---|---|
| TUI stack | Ink (stock) + manual alt-screen | Ink (alt-buffer) [\[1\]][ref-1] | ratatui/crossterm [\[6\]][ref-6] | custom `pi-tui` [\[11\]][ref-11] | Ink fork [\[15\]][ref-15] | high |
| Render buffer | alt-screen, Ink **incremental** path | fullscreen alt-buffer [\[1\]][ref-1] | inline normal buffer [\[7\]][ref-7] | inline normal buffer [\[14\]][ref-14] | inline default; opt-in fullscreen [\[16\]][ref-16] | high (partial for Claude Code) |
| Reserves a bottom row? | **Yes** (`FULLSCREEN_GUARD_ROWS=1`, `rows−1`) | **Yes** (`paddingBottom={1}` + `−1`) [\[2\]][ref-2] [\[3\]][ref-3] | **No** (fills to last row) [\[8\]][ref-8] | **No** (fills to last line) [\[12\]][ref-12] | **No** (fullscreen fills all rows) [\[16\]][ref-16] | high |
| Primary flicker defense | Guard row → stay on Ink incremental path | Alt-buffer + incremental rendering [\[1\]][ref-1] | DEC 2026 synchronized output [\[8\]][ref-8] | DEC 2026 + explicit `ESC[2K` [\[12\]][ref-12] [\[13\]][ref-13] | BSU/ESU atomic swap [\[17\]][ref-17] | high (partial for Claude Code) |
| Per-frame update | Ink per-line diff | Ink per-line diff [\[1\]][ref-1] | custom cell diff [\[9\]][ref-9] | custom line diff [\[12\]][ref-12] | Ink-fork diff [\[17\]][ref-17] | high |

---

## KQode Lessons

### Product behavior

- The reserved bottom row is **not a universal TUI norm** — only the two Ink agents (KQode, Gemini CLI) leave one; Codex, Kimi Code, and Claude Code render to the last row. So KQode's blank bottom row is a defensible Ink accommodation, not an odd deviation, but it is also not something users should expect from "coding-agent TUIs" in general. [\[2\]][ref-2] [\[8\]][ref-8] [\[12\]][ref-12] [\[16\]][ref-16]

### Architecture implications

- There are two mainstream flicker-avoidance strategies, and KQode sits in the first camp: **(a) render one row/line short to keep a differential/incremental path** (KQode's guard row; Gemini reserves a row inside an incremental alt-buffer), versus **(b) fill the full height and wrap every repaint in DEC 2026 synchronized output** (Codex, Kimi Code, Claude Code fullscreen). KQode's own edge-rendering learnings note that Ink's Windows fullscreen clear+repaint *is* wrapped in DEC 2026 but WezTerm-on-Windows does not present it atomically — which is precisely why KQode chose strategy (a). Adopting strategy (b) for edge-to-edge fill would re-expose that WezTerm case unless KQode owns its own synchronized-output frame writer like Kimi/Codex. [\[8\]][ref-8] [\[13\]][ref-13] [\[17\]][ref-17]
- If KQode ever wants edge-to-edge bottom rendering, the reference-aligned path is Kimi/Codex-style **explicit frame ownership** (build the whole frame, `ESC[2K` per changed line, wrap in `?2026h/?2026l`, single write) rather than removing the guard row while still on stock Ink. [\[12\]][ref-12] [\[13\]][ref-13]

### Evaluation ideas

- Add a terminal-matrix smoke check (Windows Terminal, WezTerm-on-Windows, and one Unix terminal) asserting the bottom row/line behavior for KQode's guard-row mode, mirroring how these agents encode bottom-edge behavior as a first-class rendering concern. [\[8\]][ref-8] [\[16\]][ref-16]

### Risks and tradeoffs

- KQode's guard row costs one usable row and is a behavioral trick (forcing stock Ink off its fullscreen path); the synchronized-output alternative is cleaner and edge-to-edge but depends on terminal support for DEC 2026 (absent/atomicity-broken on old Windows console and WezTerm-on-Windows), with no fallback in the agents that rely on it. Keeping the guard row trades a row for robustness across terminals KQode targets. [\[13\]][ref-13] [\[17\]][ref-17]

---

## Evidence Gaps

- Claude Code: closed source; all findings are from a local reverse-engineered copy with no upstream-pinned SHA (`citation_gap`). Treat as directional, not authoritative.
- Gemini CLI: alt-buffer default value inferred, not read from config (`partial_trace`).
- Kimi Code: approximate line numbers; `VirtualTerminal` variant unread (`partial_trace`).

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link. Claude Code entries are local paths (no upstream-pinned source; `citation_gap`).

- <a id="ref-1"></a>[1] Gemini CLI: `render()` options set `alternateBuffer`/`incrementalRendering` (fullscreen alt-buffer) ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/interactiveCli.tsx)).
- <a id="ref-2"></a>[2] Gemini CLI: root layout `height={terminalHeight}` with `paddingBottom={1}` in alt-buffer mode (bottom row reserved) ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/layouts/DefaultAppLayout.tsx#L29-L40)).
- <a id="ref-3"></a>[3] Gemini CLI: `availableTerminalHeight = max(0, terminalHeight − controls − bgTask − 1)` ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/AppContainer.tsx)).
- <a id="ref-4"></a>[4] Gemini CLI: line wrapping disabled (`\x1b[?7l`) in alt-buffer mode ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/core/src/utils/terminal.ts)).
- <a id="ref-5"></a>[5] Gemini CLI: `InboxDialog` height comment names "DefaultAppLayout's alt-buffer paddingBottom (1)" ([code](https://github.com/google-gemini/gemini-cli/blob/15a9429b69bd4c72514678ac17c88087f7ab9d48/packages/cli/src/ui/components/InboxDialog.tsx)).
- <a id="ref-6"></a>[6] Codex: TUI crate depends on `ratatui` + `crossterm` ([code](https://github.com/openai/codex/blob/cca16a10878202cb2f6e9666b6b4330329ea7e65/codex-rs/tui/Cargo.toml#L51-L59)).
- <a id="ref-7"></a>[7] Codex: `init()` inline viewport ("history stays in normal scrollback"); alt-screen only for overlays/resume ([code](https://github.com/openai/codex/blob/cca16a10878202cb2f6e9666b6b4330329ea7e65/codex-rs/tui/src/tui.rs)).
- <a id="ref-8"></a>[8] Codex: `Tui::draw()` sets `area.height = height.min(size.height)` (no bottom reserve) inside `crossterm::SynchronizedUpdate::sync_update` (DEC 2026) ([code](https://github.com/openai/codex/blob/cca16a10878202cb2f6e9666b6b4330329ea7e65/codex-rs/tui/src/tui.rs)).
- <a id="ref-9"></a>[9] Codex: custom `Terminal` with `viewport_area: Rect` and `diff_buffers()` cell diffing ([code](https://github.com/openai/codex/blob/cca16a10878202cb2f6e9666b6b4330329ea7e65/codex-rs/tui/src/custom_terminal.rs)).
- <a id="ref-10"></a>[10] Codex: finalized history written to scrollback via scroll-region ANSI (not `insert_before`) ([code](https://github.com/openai/codex/blob/cca16a10878202cb2f6e9666b6b4330329ea7e65/codex-rs/tui/src/insert_history.rs)).
- <a id="ref-11"></a>[11] Kimi Code: `pi-tui` README — "differential rendering and synchronized output for flicker-free" ([code](https://github.com/moonshotai/kimi-code/blob/9b76e5bff631cceaeecb2b0cbc096533c5fdc8cc/packages/pi-tui/README.md#L1-L5)).
- <a id="ref-12"></a>[12] Kimi Code: `doRender()`/`fullRender()` wrap frames in `?2026h`/`?2026l`; `cursorRow = max(0, newLines.length − 1)` (no guard row) ([code](https://github.com/moonshotai/kimi-code/blob/9b76e5bff631cceaeecb2b0cbc096533c5fdc8cc/packages/pi-tui/src/tui.ts#L1265-L1285)).
- <a id="ref-13"></a>[13] Kimi Code: differential path clears each changed line with `\x1b[2K` and removed lines with `\r\n\x1b[2K`, single flush ([code](https://github.com/moonshotai/kimi-code/blob/9b76e5bff631cceaeecb2b0cbc096533c5fdc8cc/packages/pi-tui/src/tui.ts#L1475-L1530)).
- <a id="ref-14"></a>[14] Kimi Code: terminal `clearScreen()` writes `\x1b[2J\x1b[H` (no `?1049` alternate screen anywhere in `pi-tui`) ([code](https://github.com/moonshotai/kimi-code/blob/9b76e5bff631cceaeecb2b0cbc096533c5fdc8cc/packages/pi-tui/src/terminal.ts)).
- <a id="ref-15"></a>[15] Claude Code (local copy, `citation_gap`): `CLAUDE_CODE_NO_FLICKER` fullscreen toggle, auto-disabled under `tmux -CC` (`utils/fullscreen.ts`).
- <a id="ref-16"></a>[16] Claude Code (local copy, `citation_gap`): fullscreen `AlternateScreen` box is `height={size.rows}` width `100%` (fills all rows; overflow via `overflow: scroll`) (`ink/components/AlternateScreen.tsx`).
- <a id="ref-17"></a>[17] Claude Code (local copy, `citation_gap`): full repaint "wrapped in BSU/ESU — old content stays visible until the new frame swaps atomically"; avoids re-writing `?1049h` on resize to prevent blank flicker (`ink/ink.tsx`).

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
