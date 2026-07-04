---
title: TUI half-block (▄/▀) background caps are half-line padding, not seam-fixing
date: 2026-07-04
category: design-patterns
module: KQode TUI (Ink) message/input background rendering
problem_type: design_pattern
component: frontend_stimulus
severity: low
applies_when:
  - Rendering a colored background "bubble" behind text in a terminal / Ink TUI
  - Deciding how to add vertical padding around a terminal background block
  - Explaining, commenting, or reviewing the BackgroundBlock / halfLineRow code
tags: [tui, ink, terminal-rendering, half-block, background-block, truecolor, padding]
---

# TUI half-block (▄/▀) background caps are half-line padding, not seam-fixing

## Context

KQode's Ink TUI draws user-message and input "bubbles" with a background color. The top and bottom edge rows are rendered with Unicode half-block glyphs — `▄` LOWER HALF BLOCK (U+2584) on top, `▀` UPPER HALF BLOCK (U+2580) on bottom — instead of ordinary full-background rows.

While documenting this, the rationale in prose (and the mental model in review) was **wrong twice**, and both were corrected only after investigation + an empirical A/B test:

1. First wrong story: the half-blocks exist to "cover seams between adjacent rows." A reader pushed back — full rows are contiguous, there is no inter-row seam — and they were right.
2. Second wrong story: the technique "saves a row / is more compact." Also wrong — the bubble occupies the same number of rows either way.

This doc records the correct model so the wrong ones don't get re-derived or copied into comments/docs again.

## Guidance

**A terminal cell's background is all-or-nothing** — you can only fill a *whole* cell with a background color; there is no "half-cell background." So if you want the bubble to have *vertical padding* thinner than one full row, background color alone cannot do it.

A half-block glyph is the escape hatch: **it paints half the cell in the glyph's FOREGROUND color and leaves the other half showing the cell background.** Set the glyph foreground to the bubble color and the cell background to the surrounding body color, and the edge row becomes a *half-row* of bubble color that blends into the body on its other half — i.e. half a line of padding.

```ts
// tui/src/libs/tui/backgroundBlock.ts
export const LOWER_HALF_BLOCK = '▄'; // U+2584
export const UPPER_HALF_BLOCK = '▀'; // U+2580

// tui/src/libs/tui/bodyRows.ts — the edge ("cap") row
function halfLineRow(columns: number, glyph: string): BodyRow {
  return {
    backgroundColor: theme.colors.bodyBackground,   // cell background = surrounding body
    color: theme.colors.messageBackground,          // glyph foreground = bubble color
    text: glyph.repeat(columns)
  };
}

// A prompt bubble is three rows: ▄ cap + text row(s) + ▀ cap
return [
  halfLineRow(columns, LOWER_HALF_BLOCK),
  ...textRows,
  halfLineRow(columns, UPPER_HALF_BLOCK)
];
```

The input composer does the same via `ComposerFrame.tsx` (`ComposerHalfLine`). Rendering is gated by `shouldRenderBackgroundBlock`, which only turns the background on for truecolor terminals (`colorDepth >= 24`) and off under `NO_COLOR` or a screen reader.

There are exactly three padding options; pick per the trade-off:

| Option | Bubble height (1-line msg) | Look | Notes |
| --- | --- | --- | --- |
| No caps | 1 row | cramped, no padding | tightest |
| Full-row caps | 3 rows, all solid | heavy / chunky | this is Gemini CLI's non-truecolor fallback (`<Box paddingY={1} backgroundColor=…>`) |
| Half-block caps | 3 rows, edges half-colored | light, soft edge | **chosen** — half-row padding |

The technique is borrowed from Gemini CLI's `HalfLinePaddedBox` (`packages/cli/src/ui/components/shared/HalfLinePaddedBox.tsx`), whose own JSDoc says it "renders a solid background with **half-line padding** at the top and bottom using block characters (▀/▄)." KQode's test even labels the constants "Gemini-style half-line glyphs."

## Why This Matters

- **Don't describe it as seam-fixing.** That framing is false and misleads the next reader. The middle rows are plain full-background rows and never seam; the half-blocks only appear at the top/bottom edge; and the documented fallback for non-truecolor is *full-row padding*, which proves the purpose is padding, not seam repair.
- **It costs the same rows as full-row padding** (`N + 2` for an `N`-line message). Half-block vs full-row is *not* a compactness win — the only difference is how much of the two cap rows is colored (half vs full), i.e. a softer, lighter edge. Terminal row height / line spacing is fixed by the terminal and font and does not change with the glyph.
- **The real payoff is purely cosmetic:** a half-line of soft vertical padding, confirmed visibly better than a bare single-row background.

## When to Apply

- You want a background bubble with *less than a full row* of top/bottom padding in a terminal UI.
- You are writing or reviewing comments/docs for `BackgroundBlock`, `halfLineRow`, or `ComposerHalfLine` — frame them as half-line padding.
- If truecolor is unavailable, prefer honest full-row padding (`paddingY={1}` + background) rather than emitting half-block glyphs that would be color-quantized.

## Examples

Empirically verified this session with a temporary `KQODE_BG_STYLE=fullrow` toggle (since removed) that dropped the caps:

- **No caps (only the text row has background):** each message is a single narrow row, bubbles butt up against neighboring lines — visibly cramped.
- **Half-block caps (default):** each message gains ~half a row of padding above and below — a taller, "card"-like bubble with breathing room.

Same footprint concept, per single-line message:

```text
no caps        full-row caps        half-block caps (chosen)
[ text ]       [ ██████ ]           [ ▄▄▄▄▄▄ ]  <- half bubble color
               [ text   ]           [ text   ]
               [ ██████ ]           [ ▀▀▀▀▀▀ ]  <- half bubble color
1 row          3 solid rows         3 rows, edges half-colored
cramped        heavy                light + soft edge
```

The reader-facing writeup lives at `blog/docs/v0.1.0/U2-交互式主界面/02-TUI主题与背景块组件.md` (with three schematic SVGs and the two A/B screenshots).

## Related

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md` — other Ink TUI internals (low overlap; different concern).
- Source: `tui/src/libs/tui/backgroundBlock.ts`, `tui/src/libs/tui/bodyRows.ts`, `tui/src/components/PromptComposer/ComposerFrame.tsx`, `tui/src/theme/themeConfig.ts`.
- Prior art: Gemini CLI `HalfLinePaddedBox`; the `chafa` terminal image renderer and Unicode "Block Elements" for the underlying half-block-pixel technique.
