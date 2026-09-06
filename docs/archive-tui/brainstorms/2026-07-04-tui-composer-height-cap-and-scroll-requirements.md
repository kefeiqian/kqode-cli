---
date: 2026-07-04
topic: tui-composer-height-cap-and-scroll
---

# TUI Composer Height Cap and Independent Scroll

## Summary

Cap the prompt composer's maximum height at about half the terminal so a long prompt can no longer bury the transcript, and make the composer's content independently scrollable by mouse wheel. The wheel routes to whichever pane the pointer is over — reading the row coordinate already carried in the mouse escape sequence — so the body transcript and the composer never fight over the same wheel notch.

---

## Problem Frame

The composer can currently grow to nearly the full terminal height. `resolveHomeScreenLayout` (`tui/src/state/ui/layout.ts`) caps the composer's visible rows at everything except a single body row (`minBodyRows = 1`), so a long or pasted prompt pushes the transcript down to one line and effectively hides all prior context while you type.

Mouse-wheel scrolling today only drives the transcript: one `useInput` in `tui/src/components/HomeScreenView.tsx` parses the wheel and calls `scrollBodyByRows`, while the composer's input dispatcher explicitly ignores mouse input. There is no way to wheel-scroll a long prompt, and if the composer ever did respond to the wheel, both panes would react to the same notch because Ink delivers every input to every active handler.

The composer already slides its visible window to keep the text cursor in view (`formatVisiblePromptView` in `tui/src/components/PromptComposer/promptTextView.ts`), so keyboard navigation scrolls a capped composer for free — the missing pieces are the height cap, wheel-driven scrolling, and a rule for which pane the wheel controls.

---

## Key Flows

- F1. Wheel-scroll the transcript
  - **Trigger:** User turns the mouse wheel with the pointer over the header, body, spacer, or cwd region.
  - **Actor:** TUI user.
  - **Steps:** The single wheel dispatcher reads the pointer row from the mouse event → the row is above the composer region → the transcript scrolls by the wheel step, unchanged from today.
  - **Outcome:** The body transcript scrolls; the composer is untouched.
  - **Covered by:** R7, R8, R10

- F2. Wheel-scroll the composer
  - **Trigger:** User turns the mouse wheel with the pointer over the composer region.
  - **Actor:** TUI user.
  - **Steps:** The dispatcher reads the pointer row and sees it is within the composer region → if the composer content overflows its capped height, its visible window moves without moving the text cursor; if the composer has nothing to scroll, the event falls through and scrolls the body → when the cursor row leaves the visible window the terminal cursor is hidden → the moment the user edits text or presses a cursor key, the composer snaps back to the cursor-following window.
  - **Outcome:** A long prompt is fully reviewable by wheel while the transcript stays put, and editing always returns the view to the cursor.
  - **Covered by:** R3, R4, R5, R6, R8, R9

---

## Requirements

**Composer height cap**
- R1. The composer's maximum visible height is capped at half the terminal height (`floor(rows/2)`), replacing today's near-fullscreen cap; the body receives the remaining rows.
- R2. The composer still starts at one row and grows with wrapped/validation content up to the cap — dynamic growth from short prompts is preserved.
- R3. The half-height cap is expressed as a named constant colocated with the other composer/scroll UX knobs, not a bare literal (KQode constants convention).

**Composer scrolling (independent view offset)**
- R4. When the composer content exceeds its capped visible height, the content is scrollable by mouse wheel independently of the transcript, moving the visible window without moving the text cursor (mirrors body-scroll semantics).
- R5. Wheel-up reveals earlier composer rows; wheel-down returns toward the cursor-following baseline; scrolling is clamped to the prompt's own bounds so it cannot scroll past the first or last wrapped row.
- R6. When scrolling moves the text cursor's row outside the visible window, the terminal cursor is hidden; it reappears once the cursor row is visible again.
- R7. Any text edit or cursor-key movement resets the composer scroll back to the cursor-following window (snap-back), so the cursor is always visible while editing.

**Wheel routing (hover-based)**
- R8. A single wheel dispatcher chooses the target pane from the pointer's row, parsed from the mouse escape sequence. No second `useInput` is added; the composer keeps its single keyboard dispatcher and continues to ignore mouse input.
- R9. A wheel event whose pointer row falls within the composer region scrolls the composer; every other row scrolls the body.
- R10. When the pointer is over the composer but the composer has nothing to scroll (short prompt), the event falls through and scrolls the body.
- R11. Keyboard scroll keys (PageUp / PageDown / End) continue to scroll the body only and are not rerouted to the composer.

---

## Acceptance Examples

- AE1. **Covers R8, R9.** Given a scrollable transcript and the pointer over the body, when the user wheels up, the transcript scrolls up and the composer is unchanged.
- AE2. **Covers R4, R9.** Given a prompt taller than the capped composer and the pointer over the composer, when the user wheels up, the composer reveals earlier rows while the transcript stays put and the text cursor does not move.
- AE3. **Covers R10.** Given a one-row composer and the pointer over it, when the user wheels, the body scrolls.
- AE4. **Covers R7.** Given the composer scrolled up away from the cursor, when the user types a character, the composer snaps back to the cursor row and shows the edit.
- AE5. **Covers R6.** Given the composer scrolled until the cursor row leaves the visible window, then the terminal cursor is hidden; when the user scrolls the cursor row back into view, the cursor is shown again.
- AE6. **Covers R1, R2.** Given a terminal of N rows, when the composer grows past `floor(N/2)` text rows, its visible height stops at the cap and the remaining prompt is reached by scrolling rather than by pushing the transcript below one row.

---

## Success Criteria

- A long or pasted prompt never occupies more than about half the terminal; the transcript stays at least roughly half-visible at all times.
- Wheel behavior matches GUI/modern-terminal expectation: it scrolls whatever the pointer is over, with no mode to enter and no modifier to hold.
- The Ink text cursor still lands on the active composer text row across window sizes after the change (per the `tui/AGENTS.md` cursor-placement rule).
- A downstream implementer can build this without re-deciding the scroll model, the routing strategy, the fall-through behavior, or the height fraction.

---

## Scope Boundaries

- PageUp / PageDown / End remain body-only; only the mouse wheel is routed by pointer location.
- No modifier-key scrolling (e.g. Shift+wheel) is introduced.
- No horizontal scrolling of the composer; soft-wrap behavior is unchanged.
- No change to how the composer grows from a single row, and no change to the transcript's own scroll behavior.
- No click-to-position, text selection, or drag — this uses the existing wheel-only SGR mouse reporting, not full mouse tracking.

---

## Key Decisions

- **Hover-based routing over a modifier key or focus toggle:** scroll-what-you-point-at needs no mode; the cost is computing which pane the pointer is over on each wheel event.
- **View-only composer scroll over wheel-moves-cursor:** matches body-scroll semantics as requested; the cost is hiding the cursor when it leaves the window and snapping the view back on edit.
- **Fall-through to the body when the composer cannot scroll:** more forgiving than strict hover, since a short composer rarely needs scrolling and the user likely meant the transcript.
- **"Half" means `floor(rows/2)`** for the composer's maximum visible height, with the body taking the remainder.

---

## Dependencies / Assumptions

- Assumes SGR mouse reporting (already enabled via `ENABLE_SGR_MOUSE_TRACKING` in `tui/src/libs/terminal/mouse.ts`) includes the pointer row in wheel events — verified: the parser's regex already matches the coordinate fields and currently discards them.
- Assumes the composer region's top row is derivable from existing layout state (`composerTopAtom`) — verified present.
- Terminal must support SGR mouse reporting, which is already a precondition for the existing body wheel-scroll feature; non-TTY/unsupported terminals keep keyboard scrolling only.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Exact clamp math for the composer scroll offset, including whether wheel-down may reveal rows below the cursor baseline or only return to it.
- [Affects R9][Technical] Exact row bounds of the "composer region" for hover detection — whether the half-line background padding rows count, and how the status row is treated.
- [Affects R4][Technical] Where the composer scroll-offset state lives and how its maximum is computed for clamping and for the R10 fall-through check.
