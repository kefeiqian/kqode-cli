---
date: 2026-07-11
topic: tui-command-surface-visual-consistency
---

# TUI Command Surfaces: One Visual Grammar

## Summary

Give every KQode command surface one shared visual grammar so moving between them feels seamless
instead of torn: a single selection idiom (`❯` chevron + full-width highlight bar) replacing
today's `●` / `›` / reverse-video mix, one constant popup height so nothing jumps between
`/theme`, `/model`, `/memory`, `/connect`, and resume, the accent-colored top rule on every
surface — including the floating `/` command list — and a consistent blank gap row above each
popup's footer hint. This extends the docked-popup architecture from
[2026-07-10-tui-command-surface-half-height-cap](2026-07-10-tui-command-surface-half-height-cap-requirements.md);
it changes only look, not content.

---

## Problem Frame

The command surfaces were each built at a different time and never converged on one look, so
switching between them is visibly incoherent. Three drifts stack up:

- **Selection marker.** The floating `/` list uses a `❯` chevron with a highlight bar; `/theme`
  marks the row with `●`; `/model` uses `›` for the cursor (plus a separate `●` for the active
  model); `/connect` uses `›`; `/memory` and resume use bare reverse-video with no marker at all.
  Four different idioms for "this row is selected."
- **Height.** Each docked popup sizes to its own content (capped at half the screen), and the
  resume panel targets a taller fixed size, so `/theme` (6 items) and `/model` (a long list) open
  at different heights. Opening one, closing it, and opening another makes the panel jump — the
  "tearing" the user feels when navigating the shell.
- **Top rule.** The five docked popups draw the accent separator that fences them off from the
  transcript; the floating `/` command list has none, so the family looks half-finished.

Individually minor, together they make the command layer feel like a set of unrelated screens
rather than one product.

---

## Requirements

**Selection idiom**
- R1. Every selectable-list command surface renders the highlighted row with a `❯` chevron marker
  plus a full-width highlight bar, matching the floating `/` command list and the reference
  design. This replaces `●` (`/theme`), `›` (`/model` cursor, `/connect`), and bare reverse-video
  (`/memory`, resume).
- R2. Non-highlighted rows render with no marker and no bar, reserving a blank chevron-width gutter
  so text stays column-aligned between highlighted and plain rows.
- R3. State indicators that are distinct from the selection cursor are preserved: `/model`'s
  active-model `●` dot and `/memory`'s `[Active]` / `[Inbox]` tab markers remain and are not
  merged into the selection idiom.

**Constant height**
- R4. The docked popups — `/theme`, `/model`, `/memory`, `/connect`, and resume — all render at one
  shared constant total height, so switching between them never changes the popup's height.
- R5. That constant is a fixed size that stays the same regardless of terminal size, capped to at
  most half the terminal (`⌊rows/2⌋`) on terminals too short to fit it, so it never violates the
  existing half-height limit.
- R6. A surface with less content than the constant height pads the remaining rows blank rather than
  shrinking; a surface with more content scrolls internally within the constant height, keeping the
  existing scroll windows and "more" position indicators.

**Top rule and footer gap**
- R7. Every command surface shows the accent-colored top separator rule: the five docked popups keep
  theirs, and the floating `/` command list gains a matching rule above it.
- R8. Every docked popup renders exactly one blank gap row between its content area and its bottom
  footer hint line, consistently — always present, not dropped on cramped terminals. The gap is part
  of the surface's fixed chrome and counts toward the constant height. (The floating `/` list is
  unaffected: its hints live in the status bar, not an in-panel footer.)

**Convention documentation**
- R9. `tui/AGENTS.md` documents the unified command-surface visual grammar — the `❯`-chevron +
  highlight-bar selection idiom, the shared constant popup height (capped to half), the top rule on
  every command surface, and the always-present footer gap row — so a future surface inherits the
  grammar instead of re-deriving it.

---

## Acceptance Examples

- AE1. **Covers R4, R5.** Given a tall terminal, when the user opens `/theme` (few items), closes
  it and opens `/model` (many items), then `/memory`, each popup renders at the same total height
  and the panel does not jump between them.
- AE2. **Covers R5.** Given a terminal too short to fit the constant height, when any docked popup
  opens, it caps at `⌊rows/2⌋` rather than exceeding half the screen.
- AE3. **Covers R6.** Given `/theme` with fewer themes than the constant height, when it opens the
  rows below the list render blank up to the constant height; given `/model` with more models than
  fit, the list scrolls internally and shows a position indicator.
- AE4. **Covers R1, R3.** Given `/model` open with the cursor on a non-active model, when it renders
  the highlighted row shows the `❯` chevron + bar while the currently-active model still shows its
  `●` dot on its own row.
- AE5. **Covers R1, R7.** Given the floating `/` command list open, when it renders it shows the
  `❯` chevron + highlight bar on the selected command and an accent top rule above the list.
- AE6. **Covers R8.** Given any docked popup rendered at its capped (not full) height, when it shows
  its footer, exactly one blank gap row still separates the content from the footer hint line.

---

## Success Criteria

- Switching between `/theme`, `/model`, `/memory`, `/connect`, and resume shows no height change and
  one consistent selection marker and top rule — the incoherence and "tearing" when navigating the
  command layer is gone.
- A single selection idiom (`❯` + bar) appears on every command surface; no surface still uses `●`,
  `›`, or bare reverse-video as its selection cursor.
- Every command surface — the five docked popups and the floating `/` list — shows the accent top
  rule.
- A contributor reading `tui/AGENTS.md` can add a new command surface that matches the grammar
  without re-deriving the marker, height, divider, or footer-gap choices.

---

## Scope Boundaries

- No change to any surface's content, data, or backend behavior — theme catalog, model/connect
  logic, memory modes and forms, resume list all stay as they are. This is visual/layout only.
- `/help` stays fullscreen and is otherwise unchanged (the standing exception to the docked-popup
  rules).
- The floating `/` command list is not resized — it keeps its own fixed height and stays autocomplete
  layered over the composer; it only gains the top rule (it already uses the `❯` + bar idiom).
- `/model`'s active-model `●` dot and `/memory`'s `[Active]` / `[Inbox]` tab indicators are
  preserved — they carry state, not cursor position.
- No palette or theme color changes; reuse the existing accent and highlight theme tokens.
- No new footer-hint copy is a goal here; footer wording changes only where consistency strictly
  requires it.

---

## Key Decisions

- Fixed moderate height over always-half-screen — consistent on any terminal size, accepting a
  little blank space beneath short surfaces. [User decision]
- Divider is all-or-none, resolved to "all have it": add the top rule to the floating `/` command
  list rather than stripping it from the docked popups (stripping would let them blend into the
  transcript, which is what the rule prevents). [User decision]
- Selection idiom is `❯` chevron + full-width highlight bar, adopting the existing `/` command-menu
  style and matching the reference (GitHub Copilot CLI command list). [User decision]
- Preserve `/model`'s active-model `●` as a separate indicator from the selection chevron —
  highlighting a non-active model must not erase which model is active. [Inferred]
- The floating `/` command list keeps its own height because it is autocomplete over the composer,
  not a full-surface popup the user "switches" to; only its rule is unified. [Confirmed at synthesis]
- The footer hint line always has a blank gap row above it on every docked popup, superseding the
  current optimization that drops the gap to reclaim a content row on cramped terminals — chosen for
  consistent framing across surfaces. [User decision]

---

## Dependencies / Assumptions

- Builds on the docked-popup architecture in
  [2026-07-10-tui-command-surface-half-height-cap](2026-07-10-tui-command-surface-half-height-cap-requirements.md):
  the shared constant height must remain at or below `⌊rows/2⌋` (`POPUP_MAX_HEIGHT_DIVISOR = 2` in
  `tui/src/constants/ui.ts`).
- The `❯`-chevron + highlight-bar idiom already exists in `tui/src/components/SlashCommandMenu/index.tsx`;
  this work propagates it to `/theme`, `/model`, `/memory`, `/connect`, and resume — likely via a
  shared row/marker helper (a planning decision).
- Existing internal scroll windows (`/theme`, `/model`, `/memory`, resume) are reused; `/connect`'s
  provider list and forms must fit within the constant height or scroll — verified in planning.
- The exact fixed content-row count is a planning decision; a natural candidate is around the resume
  panel's current session-row count (~10).
- R8 supersedes the current `resolveDockedFooterGap` optimization (in `tui/src/libs/tui/layout.ts`)
  that drops the footer gap when the panel is capped; the gap becomes unconditional chrome and is
  counted in the constant height.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] How the `❯` chevron fits the tabular surfaces (`/memory`, resume) that
  render a header row plus aligned columns: a leading chevron gutter column vs. a full-row highlight
  bar with no per-row chevron (the table header row has no chevron to align with).
- [Affects R4, R5][Technical] The exact constant height value, and how each surface's chrome (top
  rule, `/label`, memory tabs/status, footer + gap) fits inside it at the minimum terminal height
  without becoming unusable.
- [Affects R1][Technical] Whether to extract a shared selection-row/marker component (single source
  for chevron, bar, and gutter) or apply the idiom per surface.
- [Affects R7][Technical] Placement of the floating `/` command list's top rule (above the menu,
  between transcript and menu) given the menu renders above the composer rather than docked against
  the transcript.

---

## Marker Unification

| Surface | Selection today | After |
|---|---|---|
| Floating `/` list | `❯` + highlight bar | unchanged (reference) |
| `/theme` | `●` colored text | `❯` + bar |
| `/model` | `›` cursor (+ `●` active) | `❯` + bar (keep `●` active) |
| `/connect` | `›` | `❯` + bar |
| `/memory` | reverse-video | `❯` + bar |
| resume | reverse-video | `❯` + bar |

## Layout Sketch

```text
Unified docked popup (/theme /model /memory /connect resume)
┌────────────────────────────────────┐
│ transcript body                    │  <- stays visible
│════════════════════════════════════│  <- accent top rule (every surface)
│ /label                             │
│ ❯ selected row      ████████████   │  <- chevron + full-width highlight bar
│   plain row                        │
│   plain row                        │
│   (pad blank, or scroll if longer) │  ┐ content fills to the shared constant
│                                    │  ┘ height
│                                    │  <- one blank gap row (always present)
│ ↑/↓ choose · … · esc close         │  <- footer hints
└────────────────────────────────────┘
   ^ same total height for every surface, capped at ⌊rows/2⌋
```
