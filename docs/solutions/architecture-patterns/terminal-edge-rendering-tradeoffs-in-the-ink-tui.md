---
title: Terminal edge rendering trade-offs in the Ink TUI (fullscreen vs incremental)
date: "2026-07-04"
category: docs/solutions/architecture-patterns/
module: tui
problem_type: architecture_pattern
component: tooling
severity: medium
symptoms:
  - "Extra blank row at the bottom of the terminal and a gap at the right edge"
  - "WezTerm blinks/flashes on every keystroke while Windows Terminal does not"
  - "Right-aligned status text clipped on WezTerm (GPT-5.5 rendered as GPT-5.)"
  - "An empty dark block appears at the right of the composer bar after typing"
  - "Prompt cursor lands one row above the composer after changing layout math"
applies_when:
  - "Building a fullscreen Ink (v7) TUI that enters the alternate screen manually"
  - "Deciding whether to reserve a bottom guard row or fill the full terminal height"
  - "Rendering full-width background bars or bubbles that should reach the edges"
  - "Debugging per-keystroke flicker or last-column clipping on Windows terminals"
  - "Changing FULLSCREEN_GUARD_ROWS, cursor math, or composer/body width"
tags:
  - ink-tui
  - terminal-rendering
  - fullscreen
  - flicker
  - wezterm
  - windows-terminal
  - alt-screen
  - cursor
---

# Terminal edge rendering trade-offs in the Ink TUI (fullscreen vs incremental)

## Context

KQode's TUI is a hybrid renderer: it **manually enters the alternate screen**
(`tui/src/bootstrap.ts`) and runs Ink 7.1 with `incrementalRendering: true`
(`tui/src/cli/kqodeCli.tsx`). We wanted a tighter, edge-to-edge look by removing
two deliberate reservations — the bottom "guard row" (`FULLSCREEN_GUARD_ROWS`)
and the status bar's reserved final column.

Removing them surfaced a cluster of terminal-specific artifacts (blank bottom
row, right-edge gap, WezTerm per-keystroke flicker, right-aligned `GPT-5.5`
clipped to `GPT-5.`, and an empty block at the right of the composer after
typing). Investigating them against Ink 7.1's source revealed a **fundamental
rendering trade-off on Windows** that these reservations existed to sidestep.

This session first built terminal-conditional handling, then — per an explicit
product decision to **prioritize Windows Terminal** — removed all of it in favor
of unconditional edge-to-edge rendering. That decision was superseded on
2026-07-07 by the TUI ink-safe rendering plan: KQode now prioritizes
artifact-free Ink rendering, reserves a physical guard row, and uses a shared
safe content width for all rendered glyph content — bottom chrome plus
body/transcript (extended to the body on 2026-07-07 after a store-fatal error
message reproduced the last-column glyph drop in the body).
This doc captures the mechanism so the decision history and knobs are
understood, not rediscovered.

Lineage (session history): the alternate screen was introduced 2026-07-02, and
the "starts at 1/4 screen then jumps to fullscreen" first-frame bug was fixed
2026-07-03 by seeding the terminal size before the first render.

## Guidance

### Ink 7.1 has two render paths; which one runs depends on frame height

Ink treats a frame as **fullscreen** when its output height meets or exceeds the
viewport rows, and in that case it **omits its trailing newline**:

```js
// node_modules/ink/build/ink.js (~754)
const isFullscreen = isTty && outputHeight >= viewportRows;
const outputToRender = isFullscreen ? output : output + '\n';
```

The omitted newline shifts Ink's cursor baseline up one row. KQode compensates
with `INK_CURSOR_ROW_ORIGIN_OFFSET` (`tui/src/constants/ui.ts`), which **must
move in lockstep** with the guard row: fullscreen (`FULLSCREEN_GUARD_ROWS = 0`)
→ offset `1`; non-fullscreen (`FULLSCREEN_GUARD_ROWS = 1`) → offset `0`. Change
one without the other and the prompt cursor drifts one row off the composer.

### On Windows, fullscreen frames force a full clear + repaint every frame

```js
// node_modules/ink/build/ink.js (~89, ~100) — comment cites Ink issue #969
const isWindowsConsole = process.platform === 'win32';
// ... inside shouldClearTerminalForFrame:
if (isWindowsConsole && (wasFullscreen || isFullscreen)) {
    return true; // -> clearTerminal + full repaint, wrapped in DEC 2026
}
```

`clearTerminal` is `ESC[2J ESC[3J ESC[H` (erase screen + scrollback + home;
`node_modules/ansi-escapes/base.js`). Ink wraps the clear+repaint in DEC 2026
synchronized output (`ESC[?2026h … ESC[?2026l`). **Windows Terminal presents
that atomically → no flicker. WezTerm shows the intermediate blank → it blinks
on every keystroke.** (macOS/Linux never hit this branch: `isWindowsConsole` is
false, so fullscreen there uses the incremental path below.)

### The non-fullscreen (guard row) path clips the last column on WezTerm

Reserving one row keeps frames non-fullscreen, so Ink uses its incremental
`log-update` path and rewrites only changed lines:

```js
// node_modules/ink/build/log-update.js — per changed line
cursorTo(0) + nextLines[i] + eraseEndLine /* ESC[K */ + (newline or '')
```

`ESC[K` erases to end-of-line using the **current** background. Ink resets the
background (`ESC[49m`) at the line's end, so after a full-width rewritten row the
cursor sits in DECAWM "pending wrap" on the last column and `ESC[K` erases that
last cell with the **default** (dark) background. On WezTerm this shows as an
empty block at the right of the composer — **but only after you type**, because
the composer is the row that gets incrementally rewritten. Bubbles rendered once
are untouched and keep their last column.

### Full-width backgrounds: Box-with-width paints the edge; bare Text may not

A `<Box width={columns} backgroundColor>` paints its background as a solid
rectangle that reaches the last column even on WezTerm (the root background box
in `tui/src/components/HomeScreen/HomeScreenView.tsx` keeps raw columns and fills
the reserved final column behind the safe-width body rows). A bare full-width `<Text>` can lose its last
glyph on WezTerm (this is why right-aligned `GPT-5.5` clipped to `GPT-5.` in the
status bar). Mirroring the Box-with-explicit-width pattern fixes static
full-width rows — but it does **not** defeat the incremental `ESC[K` clip on a
row that is rewritten every keystroke (the composer).

### The core trade-off (Windows) and the current decision

On Windows you cannot have both on WezTerm:

| Mode | Blink | Content reaches last column |
| --- | --- | --- |
| Fullscreen (`FULLSCREEN_GUARD_ROWS = 0`) | WezTerm blinks per keystroke; WT fine | Yes (full repaint, no `ESC[K`) |
| Non-fullscreen (guard row `= 1`) | No blink | No — incremental `ESC[K` clips the last column of rewritten rows on WezTerm |

**Current decision: prioritize stability.** Render one physical row under the
terminal (`FULLSCREEN_GUARD_ROWS = 1`, `INK_CURSOR_ROW_ORIGIN_OFFSET = 0`) and
reserve a safe content column for all rendered glyph content. Composer, cwd,
status, slash-menu, fullscreen footer, and body/transcript text all use the safe
width; only background boxes keep raw columns and fill the reserved final column
as a gutter.

## Why This Matters

- These artifacts look like KQode layout bugs but are **Ink + terminal**
  interactions. Knowing the mechanism prevents hours of chasing phantom width
  and padding bugs in KQode's own layout math.
- The guard-row ↔ cursor-offset lockstep is a silent foot-gun: touching one
  without the other drifts the prompt cursor a row off the composer, and there
  are no cursor unit tests that catch a live-terminal drift.
- It frames the terminal-support decision honestly: edge-to-edge rendering was
  a deliberate historical trade-off, and the current policy chooses
  artifact-free stability over perfect physical-edge fill.
- KQode is a **hybrid** (manual alt-screen + Ink incremental line-rewrite). This
  is why it needs edge reservations at all: reference coding agents avoid the
  problem by being either fully inline in the normal buffer (OpenAI Codex on
  ratatui, Kimi on pi-tui, Gemini CLI default) or fullscreen cell-grid renderers
  (Claude Code's Ink fork, OpenCode's opentui). KQode sits in between.

## When to Apply

- Before changing `FULLSCREEN_GUARD_ROWS`, always change
  `INK_CURSOR_ROW_ORIGIN_OFFSET` in lockstep and visually verify the cursor lands
  on the composer row (no unit test covers this).
- When a full-width bar/bubble does not reach the right edge, prefer a
  `<Box width={columns} backgroundColor>` over a bare `<Text>`.
- When diagnosing per-keystroke flicker on Windows, check whether frames are
  fullscreen (`outputHeight >= viewportRows`) before suspecting KQode code.
- When choosing which terminals to optimize for, remember the fullscreen ↔
  no-flicker vs incremental ↔ edge-to-edge trade-off is WezTerm-on-Windows only;
  the current safe-canvas policy avoids depending on that edge case.

## Examples

Guard row and cursor offset move together (`tui/src/state/ui/dimensions.ts`,
`tui/src/constants/ui.ts`):

```ts
// Stability-first (current): reserve one row to stay non-fullscreen.
export const FULLSCREEN_GUARD_ROWS = 1;        // dimensions.ts
export const INK_CURSOR_ROW_ORIGIN_OFFSET = 0; // constants/ui.ts

// Historical edge-to-edge knob: fills full height, Ink renders fullscreen frames.
// export const FULLSCREEN_GUARD_ROWS = 0;
// export const INK_CURSOR_ROW_ORIGIN_OFFSET = 1;
```

Status bar using the safe chrome width (`tui/src/components/StatusBar.tsx`):

```tsx
// StatusBar reads safeChromeColumnsAtom so the model label does not depend on
// the physical final column rendering correctly.
<Box width={safeChromeColumns}>{/* ...hints... model label ... */}</Box>
```

Observed on WezTerm-on-Windows with `FULLSCREEN_GUARD_ROWS = 1`: no flicker, but
the composer bar can show a ~1-column dark block at the right after the first
keystroke if editable rows still paint through the physical final column. The
current fix pairs the guard row with `safeChromeColumnsAtom` for bottom chrome
and body/transcript so incremental rendering no longer depends on that final cell.

## Related

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
  — sibling learning on the same Ink TUI (process lifecycle, not rendering).
- `tui/AGENTS.md` — documents the bottom-stick layout, the guard row, the
  final-column reservation, and the cursor-placement fragility.
- Session lineage: alternate screen introduced 2026-07-02; first-frame
  "1/4 screen then fullscreen" size-seeding fix 2026-07-03.
