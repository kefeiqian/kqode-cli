---
date: 2026-07-07
topic: tui-ink-safe-rendering
---

# TUI Ink-Safe Rendering

## Summary

Adopt Gemini-style rendering stability for KQode's Ink TUI: the composer, status bar, and other full-width rows should avoid terminal-edge artifacts even if that requires a small guard row or guard column. The first typed character after startup must render the same clean composer frame the user already sees after a Help round trip.

---

## Problem Frame

The current TUI favors an exact edge-to-edge canvas. It fills the terminal height, paints the final column, pads editable composer rows to the full row width, and manually positions the terminal cursor from layout measurements.

That looks tight when every terminal and every Ink frame behaves perfectly, but it creates a fragile startup path. The reported screenshot shows a one-cell empty block at the right edge of the composer after the first typed character. Switching to Help and back clears the artifact, which suggests a full surface repaint resets terminal state that the first Home render did not settle cleanly.

Reference research points to a safer Ink posture. Gemini CLI keeps a polished framed input while leaving guard space and separating the full-width frame from the editable text area. Kimi Code reaches edge-to-edge stability differently by owning low-level line clearing in a custom renderer, which is not the direction for this KQode cleanup.

---

## Key Decisions

- **Stability over perfect edge-to-edge fill.** KQode should allow a small guard row or guard column when it prevents terminal-specific stale cells, clipping, or fullscreen repaint artifacts.
- **One global safe-edge policy.** Composer rows, status rows, and other full-width terminal chrome should follow the same rule so the artifact risk is not moved from one surface to another.
- **Stay within Ink.** This cleanup should make the current Ink TUI robust rather than introduce a custom renderer or low-level terminal diff engine.
- **Treat the exact root cause as a hypothesis until reproduced.** The product requirement is artifact-free rendering before and after surface switches; planning can determine the smallest code path that proves and fixes the local trigger.

---

## Requirements

**Startup and surface stability**

- R1. The first typed character after TUI startup does not leave a stale, empty, clipped, or differently colored cell at the composer's right edge.
- R2. Composer rendering after startup matches composer rendering after opening Help and returning Home; surface switching must not be required to clean up the first Home frame.
- R3. Help, Login, Model, and Home surface transitions do not leave stale terminal cells in the bottom chrome when returning to the composer.

**Safe terminal edges**

- R4. The TUI has a single safe-edge policy for terminal rows and columns whose final cells are risky across terminals.
- R5. Full-width visual frames may still span the terminal when safe, but editable text rows must not depend on painting or padding through the final terminal column to look correct.
- R6. The status bar and right-aligned model/config label follow the same safe-edge policy as the composer.
- R7. If guard space is introduced, the cwd row, composer, and command/status row remain bottom-sticky with no gap between composer and status.

**Composer look and cursor behavior**

- R8. The composer keeps its current framed, half-line background look unless a narrower frame is required to eliminate terminal-edge artifacts.
- R9. The composer still starts as one row and grows only when wrapping or validation feedback requires more rows.
- R10. The terminal cursor remains on the active composer text row across startup, typing, resize, surface switching, and copy-mode transitions.
- R11. Cursor visibility remains gated by input lock and copy mode; loading, scrolling, and selection behavior do not regress.

**Verification coverage**

- R12. The cleanup includes a reproducible check for the first typed character after startup.
- R13. The cleanup includes checks for Help round-trip rendering, terminal resize, and final-column/status-label behavior.
- R14. The fix is validated against the target terminal behavior called out in existing TUI guidance, especially terminals that differ on fullscreen repaint and final-column glyph handling.

---

## Key Flows

- F1. First startup typing
  - **Trigger:** User starts the TUI and types the first printable character into an empty composer.
  - **Steps:** Home renders → the composer accepts the character → the bottom chrome repaints once.
  - **Outcome:** The composer row is visually clean, with no stale right-edge block.
  - **Covered by:** R1, R4, R5, R10, R12

- F2. Help round trip
  - **Trigger:** User opens Help, exits Help, and resumes typing in the composer.
  - **Steps:** Home unmounts or is replaced → Help renders → Home returns → the composer accepts more input.
  - **Outcome:** The composer looks the same as it did before Help opened, and typing does not rely on the round trip to clear artifacts.
  - **Covered by:** R2, R3, R10, R13

- F3. Safe edge across bottom chrome
  - **Trigger:** The status label, cwd row, or composer content reaches the terminal's right edge.
  - **Steps:** The row renders under the shared safe-edge policy → right-aligned or padded content is clipped or guarded consistently.
  - **Outcome:** No bottom-chrome row paints a terminal-sensitive final cell in a way that can leave stale output.
  - **Covered by:** R4, R6, R7, R14

---

## Acceptance Examples

- AE1. **Covers R1, R12.** Given a fresh TUI startup with an empty composer, when the user types `1`, then the composer contains `1` and no extra empty block appears at the right edge.
- AE2. **Covers R2, R13.** Given the artifact-prone startup path, when the user opens Help and returns Home, then the composer rendering is unchanged from the clean startup rendering rather than becoming clean only after Help.
- AE3. **Covers R6, R14.** Given a long model/config label in the status bar, when it reaches the right side of the terminal, then it follows the same guard or clipping rule as composer rows.
- AE4. **Covers R7, R9.** Given a short prompt, when guard space is active, then cwd, composer, and status remain bottom-sticky and the composer remains one row.
- AE5. **Covers R10, R11.** Given the user types, resizes the terminal, opens Help, returns Home, and types again, then the cursor lands on the active composer text row whenever input is unlocked.

---

## Success Criteria

- The reported first-typing right-edge block no longer reproduces on the startup path.
- Returning from Help is no longer a visual cleanup workaround; it produces the same bottom chrome state as normal startup typing.
- KQode preserves its bottom-sticky composer experience while accepting small guard space where terminal behavior makes edge-to-edge fill unsafe.
- A downstream planner can implement the fix without re-deciding whether stability or exact terminal fill wins.

---

## Scope Boundaries

- No custom renderer, terminal diff engine, or Kimi-style synchronized-output rewrite.
- No redesign of composer editing, history, scrolling, paste, copy mode, Help, Login, or Model flows.
- No new visual theme direction beyond safe-edge adjustments required for stability.
- No requirement to match Gemini's exact UI; KQode should borrow the stability principle, not copy the design.

---

## Dependencies / Assumptions

- The exact stale-cell trigger is still a local hypothesis until reproduced with a focused test.
- Existing TUI guidance already documents fullscreen Ink repaint and final-column trade-offs, so the cleanup should update those comments if the selected guard policy changes.
- The current research conclusion is based on source inspection only; reference agents were not run.

---

## Sources / Research

- `docs/research/2026-07-07-ink-composer-rendering.md` records the source-backed comparison with Gemini CLI, Kimi Code, Codex CLI, OpenCode, Aider, and SWE-agent.
- `tui/AGENTS.md` documents the current fullscreen and final-column trade-offs that this cleanup revisits.
- `tui/src/state/ui/dimensions.ts`, `tui/src/constants/ui.ts`, `tui/src/components/PromptComposer/ComposerFrame.tsx`, `tui/src/components/PromptComposer/index.tsx`, and `tui/src/components/StatusBar.tsx` are the verified KQode surfaces behind the rendering-risk assessment.
