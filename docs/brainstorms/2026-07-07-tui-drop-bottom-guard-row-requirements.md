---
date: 2026-07-07
topic: tui-drop-bottom-guard-row
---

# Drop the TUI bottom guard row (edge-to-edge rendering)

## Summary

KQode will render its terminal UI edge-to-edge to the last physical row, removing the deliberate blank bottom "guard" row, by dropping the guard constant and letting Ink's fullscreen path own the full height. This is safe on KQode's target terminals (Windows Terminal, macOS, Linux, Ghostty) now that WezTerm-on-Windows — the only terminal the guard protected — is out of the support matrix.

---

## Problem Frame

KQode's Ink TUI reserves one physical row at the bottom of the terminal (`FULLSCREEN_GUARD_ROWS = 1` in `tui/src/constants/ui.ts`), leaving a persistent blank line below the status bar. That row exists to keep stock Ink on its incremental render path: on Windows, Ink treats a frame that fills the viewport as fullscreen and forces a full clear+repaint each frame, which WezTerm-on-Windows presents non-atomically and therefore flickers on every keystroke. The guard row sidesteps this by never letting Ink treat the frame as fullscreen.

The cost is a wasted terminal row and a less-polished, not-quite-flush look that the developer finds undesirable. The guard is also coupled to a cursor-baseline offset (`INK_CURSOR_ROW_ORIGIN_OFFSET`), so the reservation carries ongoing fragility: the two must move together whenever vertical layout math changes.

---

## Requirements

**Edge-to-edge rendering**
- R1. The Home UI renders into the full terminal height with no reserved blank bottom row; the status row reaches the terminal's last physical row.
- R2. The guard-row constant and the Ink cursor-baseline origin offset remain coupled through a single source of truth, so changing the guard auto-adjusts the offset (no hand-desynced pair).

**Invariants to preserve**
- R3. The prompt cursor lands on the active composer text row after the change — no one-row drift onto the cwd row or the row above.
- R4. cwd, composer, and status stay bottom-pinned, with exactly one blank separator row between the body and cwd and no new gaps between composer and status.
- R5. Filling the last row introduces no scroll-jump or content push (the transcript above does not shift when the frame reaches the bottom).

**Terminal matrix**
- R6. When KQode runs in Windows Terminal, the edge-to-edge frame presents without visible per-keystroke flicker.
- R7. When KQode runs in a macOS terminal, a Linux terminal, or Ghostty, edge-to-edge rendering shows no flicker and no scroll-jump.

**Decision record**
- R8. Update the edge-rendering solution doc (`docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`) and `tui/AGENTS.md` to record the edge-to-edge decision and the no-WezTerm assumption, inverting the prior "keep the guard row for stability" stance while preserving the historical rationale.

---

## Acceptance Examples

- AE1. **Covers R6.** Given KQode running in Windows Terminal, when the user types characters into the composer, the status row stays on the terminal's last row and no blank/partial frame appears between keystrokes.
- AE2. **Covers R7.** Given KQode running in a macOS/Linux terminal or Ghostty, when the UI renders and the user types, content reaches the last row with no flicker and the transcript above does not jump or scroll.
- AE3. **Covers R3, R5.** Given the composer at the bottom of a full-height frame, when the user moves the caret to the end of a soft-wrapped prompt, the terminal caret sits on the composer text row (not the cwd row or one row above) and the frame does not scroll.

---

## Success Criteria

- The blank bottom row is gone in KQode's target terminals and the status row sits on the terminal's last line — verified live on Windows Terminal and at least one non-Windows terminal.
- No cursor drift and no scroll-jump are introduced; the fragile guard↔offset coupling holds after the flip.
- A downstream implementer can execute from this doc without re-deciding the WezTerm question or the render strategy: flip the guard constant, update the offset-dependent and guard-subtraction tests, and live-verify.

---

## Scope Boundaries

- Bottom row only — the right-most safe *column* reservation (`SAFE_CHROME_COLUMN_GUARD` / `safeChromeColumnsAtom`) is unchanged; it is a separate artifact and any relaxation is a separate follow-up.
- No WezTerm support — Approach A explicitly excludes WezTerm-on-Windows; if it re-enters the matrix, revisit with a synchronized-output frame writer or a terminal-conditional guard.
- No custom frame writer or Ink patch (Approach B rejected for this matrix).
- No terminal detection / conditional guard (Approach C rejected; a prior session built and removed this).
- No redesign of composer editing, scrolling, copy mode, or body/transcript rendering.

---

## Key Decisions

- **Approach A (drop the guard row via stock Ink fullscreen) over B (own the frame writer) and C (terminal-conditional guard):** the guard row's only beneficiary was WezTerm-on-Windows, now out of the matrix, so B/C's extra machinery buys nothing here.
- **no-WezTerm is durable, not a temporary exclusion:** the developer explicitly chose simplicity over the detection-guarded safety net, accepting that Approach A would re-expose WezTerm flicker if that terminal ever returns.
- **Keep the guard↔cursor-offset coupling as the single source of truth:** flip one constant and let the offset auto-adjust, rather than hand-setting both (the desync is the documented foot-gun).

---

## Dependencies / Assumptions

- [Assumption] Windows Terminal presents DEC 2026 synchronized output atomically, so Ink's Windows fullscreen clear+repaint path shows no visible flicker there. Recorded as observed behavior in the edge-rendering solution doc; re-verify live.
- [Assumption] macOS, Linux, and Ghostty do not hit Ink's Windows-only fullscreen clear+repaint branch (gated on `process.platform === 'win32'`), so they stay on the incremental path and do not flicker at full height.
- [Assumption] WezTerm-on-Windows stays out of KQode's support matrix.
- [Dependency] Ink's fullscreen cursor-baseline behavior (omitted trailing newline) remains as currently modeled by `INK_CURSOR_ROW_ORIGIN_OFFSET`; `render()` stays on `incrementalRendering: true`.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R6][Technical] Confirm Windows Terminal shows no perceptible per-frame cost when repainting the full height on every keystroke over long transcripts.
- [Affects R1, R3][Technical] Enumerate the exact tests to update (the `dimensions.test.ts` guard-subtraction case; the cursor-offset expectations in `PromptComposer.test.tsx` and `cursorPosition.test.ts`) and whether `MIN_USABLE_TERMINAL_ROWS` semantics change when the guard is 0.
- [Affects Scope Boundaries][Needs research] Whether dropping WezTerm also makes the right-most safe *column* reservation removable, as a separate follow-up.
