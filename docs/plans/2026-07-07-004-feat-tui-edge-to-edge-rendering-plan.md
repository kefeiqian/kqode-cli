---
title: "feat: Render the TUI edge-to-edge (drop the bottom guard row)"
type: feat
status: completed
date: 2026-07-07
origin: docs/brainstorms/2026-07-07-tui-drop-bottom-guard-row-requirements.md
---

# feat: Render the TUI edge-to-edge (drop the bottom guard row)

## Summary

Drop KQode's reserved bottom guard row so the Ink TUI renders to the terminal's last physical row, by flipping the single coupled constant `FULLSCREEN_GUARD_ROWS` from `1` to `0` (which auto-recomputes `INK_CURSOR_ROW_ORIGIN_OFFSET` to `1`), updating the now-stale inline comments and the guard-dependent tests in the same commit, and inverting the recorded "keep the guard row" decision in the docs.

---

## Problem Frame

The TUI reserves one physical row at the bottom (`FULLSCREEN_GUARD_ROWS = 1`), leaving a persistent blank line below the status bar to keep stock Ink on its incremental path. That guard only ever protected WezTerm-on-Windows (which presents DEC 2026 synchronized output non-atomically and flickers on the fullscreen path); it is now dead weight for KQode's target terminals. Full framing, rationale, and the rejected alternatives are in the origin doc (see Sources & References).

---

## Requirements

- R1. The Home UI renders into the full terminal height with no reserved blank bottom row; the status row reaches the last physical row.
- R2. The guard-row constant and the cursor-baseline offset stay coupled through one source of truth, so flipping the guard auto-adjusts the offset.
- R3. The prompt cursor lands on the active composer text row — no one-row drift.
- R4. cwd, composer, and status stay bottom-pinned with the existing one-row body/cwd separator and no new gaps.
- R5. Filling the last row introduces no scroll-jump or content push.
- R6. On Windows Terminal, the edge-to-edge frame presents without visible per-keystroke flicker.
- R7. On macOS, Linux, and Ghostty terminals, edge-to-edge rendering shows no flicker and no scroll-jump.
- R8. The edge-rendering solution doc and `tui/AGENTS.md` record the edge-to-edge decision and no-WezTerm assumption, preserving historical rationale.

**Origin acceptance examples:** AE1 (Windows Terminal no-flicker, covers R6), AE2 (macOS/Linux/Ghostty no-flicker/no-scroll, covers R7), AE3 (cursor on composer row + no scroll, covers R3/R5).

---

## Scope Boundaries

- Bottom row only — the right-most safe *column* reservation (`SAFE_CHROME_COLUMN_GUARD` / `safeChromeColumnsAtom`) is unchanged.
- No WezTerm support — Approach A; Approaches B (own the frame writer) and C (terminal-conditional guard) are rejected (see origin Key Decisions).
- No custom frame writer or Ink patch.
- No terminal detection / conditional guard.
- No redesign of composer editing, scrolling, copy mode, or body/transcript rendering.

### Deferred to Follow-Up Work

- Evaluate whether dropping WezTerm also makes the safe *column* reservation removable: separate follow-up (needs research).

---

## Context & Research

*Grounded in first-hand verification during this session (constants, consumers, and tests read directly) plus the cross-agent render-mode research report; no research sub-agents or external docs were needed for a change this well-patterned.*

### Relevant Code and Patterns

- `tui/src/constants/ui.ts` — the flip point: `FULLSCREEN_GUARD_ROWS = 1` and the coupled `INK_CURSOR_ROW_ORIGIN_OFFSET = inkCursorRowOriginOffset(FULLSCREEN_GUARD_ROWS)` (`guardRows === 0 ? 1 : 0`).
- `tui/src/state/ui/dimensions.ts` — consumes the constant: `rowsAtom` via `resolveSafeRows(windowRows, FULLSCREEN_GUARD_ROWS, MIN_ROWS)` and `MIN_USABLE_TERMINAL_ROWS = MIN_ROWS + FULLSCREEN_GUARD_ROWS`. Values flow through automatically, but the `rowsAtom` JSDoc's "subtraction"/"reservation" prose goes stale at guard = 0.
- `tui/src/components/PromptComposer/cursorPosition.ts` — consumes the offset in the caret `y` math; its comment already anticipates the fullscreen `offset = 1` case.
- `tui/src/cli/kqodeCli.tsx` — `render(..., { incrementalRendering: true })` plus a now-stale guard-row comment.
- `tui/src/libs/terminal/alternateScreen.ts` — stale guard-row comment. `cursorVisibility.ts` and `useComposerCaretVisibility.ts` already reference the "fullscreen repaint path" — evidence this toggle was anticipated.

### Institutional Learnings

- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` — the guard↔offset lockstep, the Windows fullscreen clear+repaint mechanism, and the WezTerm-only flicker. This plan inverts that doc's "prioritize stability" decision.
- `docs/research/2026-07-07-tui-bottom-row-render-mode.md` — the flicker branch is gated on `isWindowsConsole && isFullscreen`, so macOS/Linux/Ghostty never hit it; Windows Terminal presents the atomic repaint without visible flicker.

---

## Key Technical Decisions

- **Flip the single coupled constant, never hand-set the offset:** change `FULLSCREEN_GUARD_ROWS` to `0` and let `inkCursorRowOriginOffset` recompute the offset. Hand-desyncing the pair is the documented cursor-drift foot-gun.
- **Keep `render()` on `incrementalRendering: true`:** unchanged, per the origin assumption.
- **Update stale inline comments in the same commit as the behavior change:** the "incremental non-fullscreen path" rationale in `constants/ui.ts`, `cli/kqodeCli.tsx`, and `libs/terminal/alternateScreen.ts`, plus the guard-"subtraction"/"reservation" JSDoc on `rowsAtom` in `state/ui/dimensions.ts`, becomes false once the guard is 0.
- **Approach A over B/C:** the guard's only beneficiary was WezTerm-on-Windows, now out of scope (see origin).

---

## Open Questions

### Resolved During Planning

- **Which tests change vs. auto-track:** `PromptComposer.test.tsx` hard-codes cursor `y` for `offset = 0` and MUST update (+1, plus the offset comment); `dimensions.test.ts`'s "subtracts the production row guard" case becomes tautological and MUST update to assert no-subtraction. `App.test.tsx` (`18 - FULLSCREEN_GUARD_ROWS`) and `cursorPosition.test.ts` (`… + INK_CURSOR_ROW_ORIGIN_OFFSET`) reference the constants symbolically → auto-track and double as regression checks. `safeCanvas.test.ts` uses literal args → unchanged.
- **`MIN_USABLE_TERMINAL_ROWS` semantics:** becomes `MIN_ROWS` (15, down from 16) — correct, since one fewer row is now needed. Flows through `terminalTooSmallAtom` and `TerminalTooSmall.tsx`'s displayed minimum.

### Deferred to Implementation

- Windows Terminal per-frame repaint responsiveness on long transcripts — a runtime observation, confirmed during live verification.
- Whether the safe *column* reservation becomes removable with WezTerm gone — separate follow-up (see Deferred to Follow-Up Work).

---

## Implementation Units

### U1. Flip the guard row to render edge-to-edge

**Goal:** Render the UI to the full terminal height by setting `FULLSCREEN_GUARD_ROWS = 0`; the coupled cursor offset auto-recomputes to `1`. Update the stale rationale comments and the guard-dependent tests so the suite stays green and meaningful.

**Requirements:** R1, R2, R3, R4, R5, R6, R7

**Dependencies:** None

**Files:**
- Modify: `tui/src/constants/ui.ts` (flip the constant; update the guard-row comment)
- Modify: `tui/src/cli/kqodeCli.tsx` (update the stale "reserving a physical guard row / incremental non-fullscreen path" comment)
- Modify: `tui/src/libs/terminal/alternateScreen.ts` (update the stale guard-row comment)
- Modify: `tui/src/state/ui/dimensions.ts` (update the `rowsAtom` JSDoc — its "subtracts `FULLSCREEN_GUARD_ROWS`" / "bypass the reservation" / "exercise the production guard subtraction" prose is stale at guard = 0)
- Test: `tui/src/__tests__/components/PromptComposer.test.tsx` (bump all five hard-coded cursor-`y` literals +1 — including the mid-string `resolveComposerCursorPosition('abcd', 38, 7, 2)` case; update the `INK_CURSOR_ROW_ORIGIN_OFFSET(0, non-fullscreen)` comment)
- Test: `tui/src/state/ui/__tests__/dimensions.test.ts` (rewrite the guard-subtraction case to assert no-subtraction semantics)

**Approach:**
- Single-source flip: only the constant changes; `inkCursorRowOriginOffset` recomputes the offset, `rowsAtom` returns the full `windowRows` (via `resolveSafeRows(windowRows, 0, MIN_ROWS)`), and `MIN_USABLE_TERMINAL_ROWS` collapses to `MIN_ROWS`.
- Do not hand-edit `INK_CURSOR_ROW_ORIGIN_OFFSET`; do not touch `render()`'s `incrementalRendering: true`.

**Patterns to follow:**
- The constant is already built to flip (`inkCursorRowOriginOffset` helper), and `cursorPosition.ts` / `cursorVisibility.ts` / `useComposerCaretVisibility.ts` comments already anticipate the fullscreen path.

**Test scenarios:**
- Happy path — **Covers AE3, R3.** `resolveComposerCursorPosition('', 38, 7)` → `{ x: 2, y: 9 }` and `resolveComposerCursorPosition('123', 38, 7)` → `{ x: 5, y: 9 }` (offset now 1); multiline `'first\nsecond'` → `{ x: 8, y: 10 }`; the soft-wrapped case's `y` shifts +1. (Updates the hard-coded literals in `PromptComposer.test.tsx`.)
- Regression (auto-tracks) — **Covers R3.** `cursorPosition.test.ts` "lands on the composer text row" (`COMPOSER_TOP + COMPOSER_BACKGROUND_TOP_PADDING_ROWS + INK_CURSOR_ROW_ORIGIN_OFFSET`) now asserts the offset-1 row and must pass unchanged.
- Happy path — **Covers R1.** `App.test.tsx` "reflows to the latest terminal size": after resize to 18 rows, output length is `18 - FULLSCREEN_GUARD_ROWS` (= 18) with the status hints on the last row — verifies edge-to-edge; passes unchanged.
- Edge case — **Covers R1.** `dimensions.test.ts`: `rowsAtom` equals raw `windowRows` for a representative size (no subtraction); `MIN_USABLE_TERMINAL_ROWS === MIN_ROWS`; the too-small gate fires below `MIN_ROWS`, not `MIN_ROWS + 1`.
- Unchanged: `safeCanvas.test.ts` (`resolveSafeRows(24, 1, 15) === 23`, etc.) uses literal args and stays valid.

**Verification:**
- `bun run typecheck` and `bun run test` pass.
- Live on **Windows Terminal**: the status row sits on the terminal's last physical row (no blank row below); no visible per-keystroke flicker; the caret sits on the composer text row while typing; no scroll-jump on typing or resize; the one-row body/cwd separator and the composer→status adjacency (per `tui/AGENTS.md`) are intact.
- Live on at least one **non-Windows** terminal when available; otherwise rely on the mechanism (macOS/Linux/Ghostty never hit Ink's Windows repaint branch).
- The "terminal too small" notice fires below 15 rows (not 16).

---

### U2. Invert the guard-row decision record in the docs

**Goal:** Update the decision record to reflect edge-to-edge rendering and the no-WezTerm assumption, preserving the historical rationale so the reversal is understood rather than rediscovered.

**Requirements:** R8

**Dependencies:** U1

**Files:**
- Modify: `tui/AGENTS.md` (the "render canvas intentionally stays one physical row under the terminal" paragraph)
- Modify: `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` (the "Current decision: prioritize stability" section and the guard-row examples)

**Approach:**
- Flip the recorded decision to edge-to-edge (`FULLSCREEN_GUARD_ROWS = 0`, offset `1`) and add the no-WezTerm assumption. Keep the guard↔offset lockstep note (still true — they moved together), the Windows/WezTerm mechanism explanation, and the historical trade-off so the decision history stays intact.

**Test scenarios:**
- Test expectation: none — documentation only.

**Verification:**
- The docs describe guard `0` / offset `1` as current, name the no-WezTerm assumption, preserve the historical rationale, and no longer contradict the code comments updated in U1.

---

## System-Wide Impact

- **Interaction graph:** `rowsAtom` now yields full height → feeds the home layout budget, the bottom-stick spacer, and `composerTop`; the cursor offset feeds the composer caret `y`. All flow from the one constant.
- **State lifecycle:** `MIN_USABLE_TERMINAL_ROWS` drops 16 → 15, changing the "terminal too small" threshold and the minimum shown in `TerminalTooSmall.tsx`.
- **API surface parity:** none — no external contracts, env vars, or exported APIs touched.
- **Unchanged invariants:** the safe *column* reservation (`safeChromeColumnsAtom` / `SAFE_CHROME_COLUMN_GUARD`), `render()`'s `incrementalRendering: true`, and the bottom-stick layout are explicitly not changed.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cursor drift (the guard↔offset foot-gun) | Single-helper coupling (flip one constant); `cursorPosition.test.ts` symbolic assertion + updated `PromptComposer.test.tsx` literals + live caret check. |
| Windows Terminal full repaint per frame on long transcripts | Atomic via DEC 2026; live-verify responsiveness; it is the same path Gemini/Codex use on Windows. |
| Automated tests cannot prove absence of live scroll-jump/flicker | Explicit live-verification checklist in U1 Verification (Windows Terminal primary). |
| Re-exposes WezTerm flicker if WezTerm returns to the matrix | Accepted per origin (no-WezTerm is durable); recorded in U2's decision inversion. |

---

## Documentation / Operational Notes

- No rollout, migration, or monitoring impact. The only user-visible change is the reclaimed bottom row and the lower "terminal too small" threshold. Doc updates are U2.

---

## Sources & References

- **Origin document:** docs/brainstorms/2026-07-07-tui-drop-bottom-guard-row-requirements.md
- **Research:** docs/research/2026-07-07-tui-bottom-row-render-mode.md
- **Decision record being inverted:** docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md
- Related code: `tui/src/constants/ui.ts`, `tui/src/state/ui/dimensions.ts`, `tui/src/components/PromptComposer/cursorPosition.ts`
