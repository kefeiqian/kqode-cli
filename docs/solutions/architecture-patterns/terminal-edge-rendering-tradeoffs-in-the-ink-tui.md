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

This session built the terminal-conditional handling, then — per an explicit
product decision to **prioritize Windows Terminal** — removed all of it in favor
of unconditional edge-to-edge rendering. This doc captures the mechanism so the
decision (and its knobs) are understood, not rediscovered.

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

The omitted newline means the physical bottom is the final visible row rather
than a row after the output. Ink 7.1's cursor helper assumed the latter for both
paths. A `+1` application offset corrected the initial render but poisoned the
stored previous position: every cursor-only Left/Right update then drifted one
row upward, and Up moved two rows. KQode now patches Ink's no-newline baseline
directly (`tui/patches/ink@7.1.0.patch`) and uses unadjusted cursor coordinates.

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
rectangle that reaches the last column even on WezTerm (see `BodyPane` bubbles,
`tui/src/components/BodyPane.tsx`). A bare full-width `<Text>` can lose its last
glyph on WezTerm (this is why right-aligned `GPT-5.5` clipped to `GPT-5.` in the
status bar). Mirroring the Box-with-explicit-width pattern fixes static
full-width rows — but it does **not** defeat the incremental `ESC[K` clip on a
row that is rewritten every keystroke (the composer).

### The core trade-off (Windows) and the decision

On Windows you cannot have both on WezTerm:

| Mode | Blink | Content reaches last column |
| --- | --- | --- |
| Fullscreen (`FULLSCREEN_GUARD_ROWS = 0`) | WezTerm blinks per keystroke; WT fine | Yes (full repaint, no `ESC[K`) |
| Non-fullscreen (guard row `= 1`) | No blink | No — incremental `ESC[K` clips the last column of rewritten rows on WezTerm |

**Updated decision:** keep the full-height canvas unconditionally
(`FULLSCREEN_GUARD_ROWS = 0`, patched Ink cursor baseline, no per-terminal
branching), but reserve the final cell from non-body chrome through the shared
`chromeColumnsAtom`. Composer wrapping, cwd layout, status text, clicks, and
caret scrolling all use that guarded width; only the body pane uses the physical
last column for scrollbar chrome.

## Why This Matters

- These artifacts look like KQode layout bugs but are **Ink + terminal**
  interactions. Knowing the mechanism prevents hours of chasing phantom width
  and padding bugs in KQode's own layout math.
- The guard-row ↔ cursor-offset lockstep is a silent foot-gun: touching one
  without the other drifts the prompt cursor a row off the composer, and there
  are no cursor unit tests that catch a live-terminal drift.
- It frames the terminal-support decision honestly: "edge-to-edge everywhere,
  WezTerm blinks" is a deliberate trade-off, not an oversight.
- KQode is a **hybrid** (manual alt-screen + Ink incremental line-rewrite). This
  is why it needs edge reservations at all: reference coding agents avoid the
  problem by being either fully inline in the normal buffer (OpenAI Codex on
  ratatui, Kimi on pi-tui, Gemini CLI default) or fullscreen cell-grid renderers
  (Claude Code's Ink fork, OpenCode's opentui). KQode sits in between.

## When to Apply

- When upgrading Ink, reapply or retire the checked-in cursor-baseline patch only
  after `inkCursorPatch.test.ts` and live fullscreen cursor navigation pass.
- When a full-width bar/bubble does not reach the right edge, prefer a
  `<Box width={columns} backgroundColor>` over a bare `<Text>`.
- When diagnosing per-keystroke flicker on Windows, check whether frames are
  fullscreen (`outputHeight >= viewportRows`) before suspecting KQode code.
- When choosing which terminals to optimize for, remember the fullscreen ↔
  no-flicker vs incremental ↔ edge-to-edge trade-off is WezTerm-on-Windows only.

## Examples

Guard row and cursor offset move together (`tui/src/state/ui/dimensions.ts`,
`tui/src/constants/ui.ts`):

```ts
// Edge-to-edge (current): fills full height; the Ink patch handles the
// no-trailing-newline cursor baseline.
export const FULLSCREEN_GUARD_ROWS = 0;

// Revert knob: reserve one row to stay non-fullscreen.
// export const FULLSCREEN_GUARD_ROWS = 1;
```

Guarded non-body chrome (`tui/src/state/ui/dimensions.ts`):

```ts
export const chromeColumnsAtom = atom((get) =>
  resolveChromeColumns(get(columnsAtom))
);
```

Observed on WezTerm-on-Windows with `FULLSCREEN_GUARD_ROWS = 1`: no flicker, but
the composer bar shows a ~1-column dark block at the right after the first
keystroke (the incremental `ESC[K` clip). With `= 0`: composer reaches the edge,
but every keystroke repaints the whole screen and WezTerm blinks.

## Related

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
  — sibling learning on the same Ink TUI (process lifecycle, not rendering).
- `tui/AGENTS.md` — documents the bottom-stick layout, the guard row, the
  final-column reservation, and the cursor-placement fragility.
- Session lineage: alternate screen introduced 2026-07-02; first-frame
  "1/4 screen then fullscreen" size-seeding fix 2026-07-03.
