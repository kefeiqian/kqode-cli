---
title: Shared command-surface shell for docked popups in the Ink TUI
date: 2026-07-11
category: docs/solutions/architecture-patterns/
module: tui
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Adding a new bottom-docked command surface (a slash-command popup) to the Ink TUI
  - Changing the docked-popup frame, constant height, footer gap, or scroll indicator
  - Migrating a hand-rolled command surface onto the shared frame
tags:
  - ink-tui
  - jotai
  - command-surface
  - docked-popup
  - shared-component
  - refactoring
  - layout
---

# Shared command-surface shell for docked popups in the Ink TUI

## Context

The five bottom-docked command surfaces — `/theme`, `/model`, `/memory`, `/connect`, and the
resume panel — were each built at a different time and each hand-rolled its own frame: the outer
height-bounded `Box`, the `DockDivider` top rule, the `/label` line, the `resolveDockedFooterGap`
wiring, the `panelRows − chrome` body math, the blank gap conditional, and a near-identical local
`*Footer` with a copy-pasted `more ↑↓` scroll indicator. Because the frame was duplicated rather than
shared, it drifted: `/connect` never received a bottom-pinned footer or the gap row, selection markers
diverged, and the chrome math was re-derived per surface. Switching between surfaces felt "torn"
(different heights, some with a top rule, some with a footer gap), and there was no single interface a
new surface could adopt to inherit the chrome.

## Guidance

Extract the frame into one shared shell and drive it with a chrome-math hook. Three pieces plus one
pure helper:

- **`CommandSurface`** (`tui/src/components/CommandSurface/index.tsx`) — the pure presentational frame.
  Renders, in fixed order: `DockDivider` → accent `/label` → optional `header` slot → fixed-height body
  → always-on gap row → bottom-pinned `CommandFooter`.
- **`useCommandSurfaceLayout`** (`.../useCommandSurfaceLayout.ts`) — the chrome-math hook. Wraps
  `resolveDockedFooterGap` and returns `{ bodyRows, showFooterGap, columns }`.
- **`CommandFooter`** (`.../CommandFooter.tsx`) — a truncating shortcut hint + a right-aligned scroll
  indicator, with a `footerTone` for the warning color.
- **`positionIndicator`** (pure, in `tui/src/libs/tui/layout.ts`) — the single scroll-indicator
  implementation shared by every footer.

A surface calls the hook, windows its list, and hands content to the frame:

```tsx
const layout = useCommandSurfaceLayout({ panelRows, chromeWithGap: THEME_DOCK_CHROME_ROWS });
const listRows = layout.bodyRows;
// ...window the list to listRows; run setVisibleRows(listRows) in an effect...
return (
  <CommandSurface
    panelRows={panelRows}
    layout={layout}
    label="/theme"
    bodyRows={listRows}
    footerHint={warning ?? THEME_FOOTER_HINT}
    footerTone={warning === null ? 'muted' : 'warning'}
    position={positionIndicator(windowOffset, Math.max(0, total - listRows))}
  >
    <ThemeRows /* … */ visibleRows={listRows} />
  </CommandSurface>
);
```

Key contracts:

- **`chromeWithGap = 4 + headerRows`.** Each surface passes its own constant (divider + label + gap +
  footer = 4, plus any header rows). The shell takes it verbatim rather than recomputing, so the budget
  stays explicit at each call site and each migration can assert row-parity against a known number.

  | Surface | chromeWithGap | header rows |
  |---|---|---|
  | `/theme`, `/model`, `/connect` | 4 | 0 |
  | resume | 5 | 1 (session-table column header) |
  | `/memory` | 6 list / 4 sub-state | 2 (tabs + status) / 0 |

- **The `header` slot carries surface-specific header rows** — `/memory`'s `[Active]`/`[Inbox]` tabs +
  status line, and resume's session-table column header.
- **`reservedContentRows`** (default 0) is any non-selectable in-body row (`/memory`'s table header)
  that the gap yields for at the hard `⌊rows/2⌋` cap, keeping at least one data row visible.

## Why This Matters

- **DRY removes the drift.** The duplicated frame is exactly what let `/connect` diverge (no
  footer/gap) and markers/height drift. One shell makes the frame consistent by construction, and new
  surfaces inherit it instead of re-deriving it.
- **The hook + pure-component split is the load-bearing decision.** A render-prop
  `<CommandSurface>{(bodyRows) => …}</CommandSurface>` cannot work: the surface needs `bodyRows` at its
  top level both for its `setVisibleRows` effect and for render-time list windowing, and hooks cannot
  run inside a render-prop callback. So the hook is the single source of the math; the component never
  recomputes it.
- **A fixed-height body exposes off-by-one header rows.** Resume's `chromeWithGap` is 5, not 4, because
  `ResumeRows` rendered an internal column-header (`visibleRows + 1`). Under the shell's fixed-height
  body box that extra row clips the last session. The fix is to move the column-header into the shell
  `header` slot so the body holds only data rows — which also makes every budget a clean
  `4 + headerRows`.
- **The footer is pinned by fixed body height, not `justifyContent`.** Children stack in document order
  with `overflow="hidden"` on the outer box and the body; with a correct `chromeWithGap` the surface
  fills `panelRows` exactly and the footer can never be pushed off-canvas by body overflow.

## When to Apply

- Adding a new bottom-docked command surface — wrap `CommandSurface` + `useCommandSurfaceLayout`; never
  hand-roll a divider/label/gap/footer.
- Changing the docked-popup frame, constant height, gap, or scroll indicator — change it in the shell,
  not per surface.
- Handling variable-height or multi-step body content — keep the active input near the top and render at
  most one feedback line, so `overflow="hidden"` collapses the least-important rows at the minimum
  terminal height (see `/connect`'s compact key step, plus its dynamic `/connect · <provider>` label
  that keeps the provider identified while the list is hidden).

## Examples

Before — every surface hand-rolled the frame:

```tsx
return (
  <Box flexDirection="column" height={panelRows}>
    <DockDivider />
    <Text color={theme.colors.accentBlue}>/theme</Text>
    <ThemeRows /* … */ visibleRows={listRows} />
    {showFooterGap ? <Text> </Text> : null}
    <ThemeFooter columns={cols} warning={warning} offset={off} total={total} visible={listRows} />
  </Box>
);
// + a local ThemeFooter carrying its own copy of the `more ↑↓` position ternary
```

After — the shell owns the frame; only the inner content differs (see the `CommandSurface` call in
Guidance). The floating `/` command menu is intentionally exempt: it is a compact, content-sized
autocomplete over the composer with no half-height dock or footer, so it shares `SelectableRow` and the
top rule but not the docked shell.

## Related

- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` — the
  width-bounded `Box` + padded-`<Text>` edge-safe idiom that the shell's divider and footer reuse.
- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md` —
  why `positionIndicator` (pure math) lives in `libs/tui/` while the hook and component live under
  `components/`.
- `docs/plans/2026-07-11-005-refactor-tui-command-surface-shell-plan.md` — the implementing plan (U1
  shell + U2–U6 surface migrations, U7 docs).
- `docs/brainstorms/2026-07-11-tui-command-surface-visual-consistency-requirements.md` — the origin
  requirements (unified visual grammar).
- `tui/AGENTS.md` — "Command-surface shell" section (the contributor-facing contract).
