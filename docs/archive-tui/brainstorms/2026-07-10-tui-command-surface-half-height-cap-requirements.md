---
date: 2026-07-10
topic: tui-command-surface-half-height-cap
---

# TUI Command Surfaces: Half-Height Cap, Docking, and Border

## Summary

Convert the four fullscreen slash surfaces (`/theme`, `/model`, `/login`, `/memory`) into
bottom-docked popups modeled on the resume panel, so the transcript stays visible above them.
Cap every command popup — including the resume panel — to at most half the terminal height, add
an accent-colored top separator as the popup/body boundary, and scroll popup content internally
when it exceeds the cap. `/help` stays fullscreen as the sole exception.

---

## Problem Frame

Today, opening `/theme`, `/model`, `/login`, or `/memory` swaps the whole home screen out for a
fullscreen surface (`App.tsx` renders the surface *instead of* `HomeScreen`). The transcript the
user was working in disappears entirely while they pick a theme, choose a model, connect a
provider, or manage memory, so they lose the context of what they were doing and there is no
visual boundary between the popup and their conversation. The resume panel already avoids this —
it docks at the bottom with a top divider and keeps the transcript visible — but it can grow past
half the screen, and the four other surfaces do not follow that pattern at all. The result is an
inconsistent shell where some command windows take over the screen and some do not.

---

## Requirements

**Docking and sizing**
- R1. `/theme`, `/model`, `/login`, and `/memory` render as bottom-docked popups within the home
  screen, keeping the transcript body visible above them, instead of replacing the whole screen.
- R2. Every command popup — `/theme`, `/model`, `/login`, `/memory`, and the resume panel —
  occupies at most half the terminal height (`⌊rows/2⌋`), counting its separator, content, and
  footer together.
- R3. A popup sizes to its content up to the half-height cap; it may be shorter than half when its
  content fits, matching the resume panel's "desired height clamped to available" behavior.
- R4. `/help` is exempt from the half-height cap and continues to render fullscreen.

**Border / separation**
- R5. Each docked popup renders an accent-colored top separator rule spanning the safe content
  width as the boundary between the transcript above and the popup below.

**Overflow scrolling**
- R6. When a popup's content exceeds its available (capped) height, the popup scrolls its content
  within the panel so every item stays reachable, rather than overflowing the cap or pushing the
  transcript/other chrome. Each affected popup exposes a consistent scroll affordance (keyboard
  navigation and/or mouse wheel) with a position indicator when content is clipped.

**Bottom-stack behavior**
- R7. While a docked popup is open, the cwd/composer/status rows are hidden (as the resume panel
  does today) and the popup owns its footer hints; the transcript body above remains scrollable.

**Convention documentation**
- R8. `tui/AGENTS.md` documents the standing convention: TUI command surfaces are bottom-docked and
  must not exceed half the terminal height, with `/help` as the sole fullscreen exception, and must
  scroll internally when content exceeds the cap.

---

## Acceptance Examples

- AE1. **Covers R2, R4.** Given a 24-row terminal, when `/model` is open the popup occupies at most
  12 rows and the transcript fills the rows above it; when `/help` is open it fills all 24 rows.
- AE2. **Covers R6.** Given more sessions/models/memories than fit in the capped popup, when the
  user navigates past the last visible row, the popup scrolls to reveal off-screen items while
  staying within the half-height cap, and shows a "more" position indicator.
- AE3. **Covers R2, R3.** Given the minimum supported terminal height, when a popup opens it still
  caps at `⌊rows/2⌋`; the visible content rows shrink and scroll rather than the cap growing.

---

## Success Criteria

- Opening `/theme`, `/model`, `/login`, or `/memory` no longer blanks the transcript — the user
  keeps conversation context while using the popup.
- Every popup except `/help` visibly stops at or below half the screen, with a clear accent
  boundary line separating it from the body.
- Long lists remain fully reachable via scrolling inside the capped popup on any supported
  terminal size.
- A future contributor reading `tui/AGENTS.md` knows surfaces must stay at or below half height
  (except `/help`) and must scroll on overflow.

---

## Scope Boundaries

- `/help` stays fullscreen and is otherwise unchanged.
- No change to the internal content, data, or flows of each surface (theme catalog, model/connect
  logic, memory modes and forms) beyond height, docking, border, and scrolling.
- The `/`-autocomplete command menu is out of scope — it is already a small, height-capped menu
  above the composer, not a half-screen command window.
- No four-sided box border; the boundary is the accent-colored top rule only.
- No new provider, model, theme, or memory capabilities.

---

## Key Decisions

- Uniform half cap applies to the resume panel too, with only `/help` exempt — chosen for one
  consistent rule over preserving the resume panel's taller session list. [User decision]
- The border is an accent-colored top separator rule, not a full box — the meaningful boundary is
  the top edge, since a docked popup is flush against the terminal's bottom and side edges. [User
  decision]
- Docked popups follow the resume panel pattern: transcript visible above, cwd/composer/status
  hidden while open, popup owns its footer. [Confirmed]
- Popups size to content up to the cap rather than always reserving a fixed half-height block.
  [Inferred]

---

## Dependencies / Assumptions

- "Half" means `⌊rows/2⌋`, matching the composer's existing half-height cap
  (`COMPOSER_MAX_HEIGHT_DIVISOR = 2` in `tui/src/constants/ui.ts`).
- `/theme`, `/model`, `/memory`, and resume already have internal scroll windows; `/login`
  (connect) likely needs a scroll window added for its provider list/forms — to be verified in
  planning.
- Docking assumes reusing the resume panel's bottom-dock rendering approach; the exact composition
  (unify the surfaces into the resume-style bottom stack vs. keep the `activeSurface` switch and
  render docked) is a planning decision.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] Whether to unify the four surfaces into the resume-panel bottom-dock
  mechanism, or keep the `activeSurfaceAtom` switch and render each surface docked.
- [Affects R6][Technical] Whether `/login` (connect) needs a new scroll window for its provider
  list and custom form at the smallest supported heights.
- [Affects R2][Technical] Exact half-cap rounding, and how each surface's chrome (title, tabs,
  footer) fits within `⌊rows/2⌋` at the minimum terminal height without becoming unusable.

---

## Layout Sketch

```text
Fullscreen /help (exception)        Docked popup (/theme /model /login /memory resume)
┌──────────────────────────┐        ┌──────────────────────────┐
│ help content             │        │ header                   │
│ (fills all rows)         │        │ transcript body          │  <- stays visible
│                          │        │══════════════════════════│  <- accent top rule
│                          │        │ popup content   ┐        │
│                          │        │ (scrolls)       ├ <= half │
│ footer                   │        │ footer          ┘        │
└──────────────────────────┘        └──────────────────────────┘
```
