---
title: "fix: Smooth TUI wheel scroll by capturing every batched notch"
type: fix
status: completed
date: 2026-07-12
origin: docs/brainstorms/2026-07-12-tui-wheel-scroll-smoothness-requirements.md
---

# fix: Smooth TUI wheel scroll by capturing every batched notch

## Summary

Make mouse-wheel scrolling keep up with the wheel by parsing **every** SGR wheel notch in a single stdin chunk and applying each in order, instead of dropping the whole chunk when a fast spin concatenates sequences. Adds a plural wheel parser and moves wheel handling out of the oversized home-screen input hook into a focused helper. Parser-level fix; no animation.

---

## Problem Frame

The wheel parser (`tui/src/libs/terminal/mouse.ts`) matches with an anchored regex (`^…$`), so it recognizes exactly one SGR sequence per call. During a fast spin the terminal emits several wheel sequences that arrive concatenated in one Ink `input` chunk, the anchored regex matches none of them, and the entire chunk is dropped — nothing scrolls. Faster scrolling drops more notches, producing the "laggy / not keeping up" feel. Verified: a 3-notch batch fails the current regex and scrolls zero rows, while a global scan finds all 3.

---

## Requirements

- R1. A single `input` chunk with multiple wheel sequences registers every notch; a single unbatched notch keeps current behavior. (origin R1)
- R2. Notches apply in order, each carrying its own direction, so a mixed up/down chunk nets correctly. (origin R2)
- R3. Per-notch routing to composer / body / docked panel / ignored is preserved via the existing routing rules. (origin R3)
- R4. Per-notch step stays `MOUSE_WHEEL_SCROLL_ROWS` (body) and the existing clamped step (composer); a chunk's net movement is the sum of its notches, clamped to existing bounds. (origin R4)
- R5. Non-wheel handling in the same hook (copy-mode selection, clicks, keyboard) is unchanged. (origin R5)

**Origin acceptance examples:** AE1 (covers R1, R4), AE2 (covers R2), AE3 (covers R3), AE4 (covers R1)

---

## Scope Boundaries

- No animated glide, momentum, inertia, or easing.
- No change to keyboard PageUp / PageDown / End / Home scrolling.
- No change to the per-notch step size (stays 3 rows for the body).
- No change to the singular `parseMouseWheelEvent` / `parseMouseWheelInput` contracts — the plural parser is added alongside.

### Deferred to Follow-Up Work

- Transcript re-wrap cost per landed notch (`resolveBodyRows` over all entries recomputes on each `scrollBodyByRowsAtom` set): measure on long transcripts once notches stop being dropped; optimize with memoization/windowing only if it proves material. Separate follow-up, not this fix.
- Bringing `HomeScreenView.tsx` fully under the 200-line guideline: extracting the wheel block lands it at ~240 lines. Further extraction of the click/keyboard input branches or JSX subcomponents into their own modules is a separate refactor, out of scope for this fix.

---

## Context & Research

### Relevant Code and Patterns

- `tui/src/libs/terminal/mouse.ts` — `SGR_MOUSE_INPUT_PATTERN` (anchored) plus `parseMouseWheelEvent` and its `WHEEL_BUTTON_OFFSET`/`WHEEL_BUTTON_COUNT` decode logic to reuse for the plural parser.
- `tui/src/components/HomeScreen/HomeScreenView.tsx` (~276 lines, over the 200-line guideline) — the `useInput` wheel block (docked-panel branch, `resolveWheelTarget` routing, composer step clamp) to extract and loop. The click branch (reads `composerTopAtom`, line 135) and keyboard branches (call `scrollBodyByRows`) are retained, so those imports stay.
- `tui/src/components/HomeScreen/rightClickPaste.ts` (`handleRightClickPaste(input, store)`) and `selectionInput.ts` (`handleSelectionGesture(store, …)`) — the established idiom for a store-taking mouse helper module to mirror.
- `tui/src/components/HomeScreen/wheelRouting.ts` — `resolveWheelTarget` stays the pure per-notch router (already unit-tested).
- `tui/src/state/ui/atoms.ts` — `scrollBodyByRowsAtom` (clamps to `maxBodyScrollOffsetRowsAtom`); `tui/src/state/ui/composer/index.ts` — `scrollComposerByRowsAtom`.
- `tui/src/components/HomeScreen/useCaretScrollSuppression.ts` — `notifyScroll` is a hook callback (ref-backed timer), so it must be passed into the helper, not set via the store.

### Institutional Learnings

- None in `docs/solutions/` touch wheel/scroll/mouse-batching. Closest is `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` (edge rendering, not input parsing) — not directly applicable.

### External References

- None. SGR mouse parsing is well-understood and local patterns are sufficient.

---

## Key Technical Decisions

- Accumulate notches (loop-and-apply per notch) rather than cap a chunk to one step: matches native scroll feel and the origin's "scroll proportionally far" intent; per-notch clamping in `scrollBodyByRowsAtom` keeps net movement bounded.
- Add `parseMouseWheelEvents` (plural, global scan) alongside the singular parser and share the per-match decode helper, rather than making the singular parser non-anchored: keeps existing single-sequence callers/tests intact while the chunk boundary gets batch-aware parsing.
- Extract wheel handling into a store-taking helper (`handleWheelScroll`) mirroring `handleRightClickPaste`: required because the home-screen input hook is already over the 200-line guideline, and it creates a testable seam for the batching behavior.

---

## Open Questions

### Resolved During Planning

- Where does the drop happen? At the chunk boundary in the `useInput` hook — the anchored single-event regex returns `null` for any multi-sequence chunk. Fix belongs in the parser + hook, not in routing or the scroll atoms.
- Keep the singular parser? Yes — it has one non-test caller (being replaced) plus existing tests; leaving it avoids churn and keeps a clean single-sequence API.

### Deferred to Implementation

- Mixed chunks that interleave a wheel notch with a click/selection gesture: today's hook is "first matching event kind wins, rest of chunk dropped." Whether to also handle a non-wheel event riding in the same chunk is rare and out of scope here; keep current precedence unless implementation shows otherwise. (origin deferred question)
- Whether `notifyScroll()` should fire once per chunk vs per applied notch — fire once per chunk that produces at least one scroll; confirm the caret suppression still settles correctly during a fast spin.

---

## Implementation Units

### U1. Plural wheel-event parser

**Goal:** Parse every SGR wheel notch in one input chunk, in order, without disturbing the singular parser.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `tui/src/libs/terminal/mouse.ts`
- Test: `tui/src/libs/terminal/__tests__/mouse.test.ts`

**Approach:**
- Add a global (non-anchored, `g`-flagged) variant of the SGR mouse pattern and iterate all matches over the chunk.
- Extract the existing wheel-button decode (offset `64`, `% 4` → up/down, `M`-only) into a shared helper so singular and plural stay DRY.
- Export `parseMouseWheelEvents(input: string): MouseWheelEvent[]` returning wheel events in source order; non-wheel matches (clicks, releases, drags) are skipped.
- Leave `parseMouseWheelEvent` / `parseMouseWheelInput` unchanged.

**Patterns to follow:**
- Existing decode + `MouseWheelEvent` shape in `tui/src/libs/terminal/mouse.ts`; rustdoc-style concise `///`→TS doc comments already used there.

**Test scenarios:**
- Happy path — Covers AE1. `\u001B[<64;10;5M` repeated 3× in one string → array of 3 `{direction:'up', row:5, column:10}`.
- Happy path — Covers AE2. Two wheel-up sequences then one wheel-down in one string → `['up','up','down']` in that exact order.
- Happy path — Covers AE4. A single wheel-up sequence → array of length 1 equal to the singular parser's result.
- Edge case. Empty string and a non-mouse string (`'hello'`) → `[]`.
- Edge case. A chunk mixing a wheel-up (`64`) with a left-press (`0`) and a release (`m`) → only the wheel event returned (length 1).
- Edge case. Wheel button carrying a modifier bit (e.g. `80`) inside a batch → still decoded as `up`.

**Verification:**
- `cargo xtask tui-test` passes the new `parseMouseWheelEvents` cases; existing `parseMouseWheelEvent` tests still pass.

---

### U2. Route home-screen wheel handling through the plural parser via an extracted helper

**Goal:** Apply every notch of a batched chunk through the existing routing, and move the wheel block out of the oversized input hook into a focused, testable helper.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1

**Files:**
- Create: `tui/src/components/HomeScreen/wheelScroll.ts`
- Create: `tui/src/components/HomeScreen/__tests__/wheelScroll.test.ts`
- Modify: `tui/src/components/HomeScreen/HomeScreenView.tsx`

**Approach:**
- New `handleWheelScroll(store, input, notifyScroll): boolean` mirroring `handleRightClickPaste(input, store)`: parse via `parseMouseWheelEvents`; if empty return `false`; otherwise loop over the notches and return `true`. Call `notifyScroll()` once — on the first notch that actually scrolls (docked / composer / body) — and skip it entirely when every notch routes to `'none'`, matching the current code that notifies only when `target !== 'none'` (see the resolved Open Question). Do **not** call `notifyScroll()` unconditionally before the loop.
- Per notch, preserve current precedence: docked panel active → `store.set(scrollBodyByRowsAtom, ±MOUSE_WHEEL_SCROLL_ROWS)`; else `resolveWheelTarget({ mouseRow, mouseColumn, composerTop, rows, columns: safeChromeColumns, composerCanScroll })` → `'composer'` applies the existing clamped composer step, `'body'` applies the body step, `'none'` skips that notch (loop continues rather than dropping the chunk). Return `true`.
- In `HomeScreenView.tsx`, replace the inline `parseMouseWheelEvent` block with an early `if (handleWheelScroll(store, input, notifyScroll)) return;`. The symbols that become unused there (and migrate into the helper) are `parseMouseWheelEvent`, `MOUSE_WHEEL_SCROLL_ROWS`, `resolveWheelTarget`, `composerCanScrollAtom`, and the `scrollComposerByRows` setter (with `scrollComposerByRowsAtom`). **Keep** `composerTopAtom` and `scrollBodyByRows`: the retained click branch still reads `composerTopAtom` (`HomeScreenView.tsx:135`) and the keyboard branches still call `scrollBodyByRows`. Let `tui-typecheck` (`noUnusedLocals`) confirm the final import set. The extraction removes ~34 lines, taking the file from ~276 toward ~240 — a meaningful reduction but still above the 200-line guideline (reaching ≤200 needs further extraction; see Deferred to Follow-Up Work).
- Keep copy-mode selection, click, right-click-paste, and keyboard branches exactly as-is.

**Execution note:** Preserve caret behavior — after moving the wheel block, confirm the composer caret still lands on the active text row (manual cursor placement is sensitive to layout/handler changes per `tui/AGENTS.md`).

**Patterns to follow:**
- `tui/src/components/HomeScreen/rightClickPaste.ts` (store-taking helper returning a handled-boolean) and `selectionInput.ts`.

**Test scenarios:**
- Happy path — Covers AE1. Seed a store with enough transcript rows and pointer over a body row; feed a 3× wheel-up chunk → `bodyScrollOffsetRowsAtom` increases by `3 × MOUSE_WHEEL_SCROLL_ROWS` (clamped), not 0.
- Happy path — Covers AE2. Two wheel-up then one wheel-down over the body → net `+MOUSE_WHEEL_SCROLL_ROWS`, applied in order.
- Happy path — Covers AE3. Pointer over a scrollable composer; batched wheel-up → composer offset moves for every notch and `bodyScrollOffsetRowsAtom` is unchanged.
- Edge case. Docked panel active; batched wheel → every notch scrolls the body (docked precedence), composer untouched.
- Edge case. All notches point outside the safe canvas (`'none'`) → no scroll applied; handler still returns `true`.
- Error/passthrough. Non-wheel input (`'hello'`, a left-click sequence) → `handleWheelScroll` returns `false` so the hook falls through to click/keyboard handling.
- Integration. `notifyScroll` spy is invoked once for a multi-notch chunk that scrolls, and is **not** invoked when every notch routes to `'none'` (pointer outside the safe canvas).

**Verification:**
- `cargo xtask tui-typecheck` and `cargo xtask tui-test` pass; `HomeScreenView.tsx` is meaningfully smaller (~240 lines with the wheel block extracted) though still above the 200-line guideline; manual fast-spin scroll in a seeded fixture (`cargo xtask tui-dev`) feels responsive with no dropped notches.

---

## System-Wide Impact

- **Interaction graph:** Only the `useInput` handler in `HomeScreenView.tsx` and `mouse.ts` change; routing (`resolveWheelTarget`) and scroll atoms are reused unchanged.
- **API surface parity:** Docked command surfaces rely on the same wheel path via `scrollBodyByRowsAtom`; the loop preserves their behavior. Command-surface internal scrolling is unaffected.
- **State lifecycle risks:** Per-notch `scrollBodyByRowsAtom` sets each clamp independently — no partial/duplicate state; net offset is bounded.
- **Unchanged invariants:** `parseMouseWheelEvent`/`parseMouseWheelInput` contracts, keyboard scrolling, copy-mode selection, and click-to-caret all stay as-is.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Extracting the wheel block drifts the composer caret (manual cursor math). | Execution note + explicit verification that the caret lands on the composer text row; no layout math changes, only handler relocation. |
| Per-notch re-wrap adds latency on very long transcripts once notches are no longer dropped. | Deferred-to-follow-up measurement; step size and clamping unchanged so worst case is bounded by chunk size. |
| Mixed wheel+click chunks change precedence unexpectedly. | Keep current "wheel wins, rest of chunk dropped" precedence; documented as a deferred question, not changed here. |

---

## Sources & References

- **Origin document:** docs/brainstorms/2026-07-12-tui-wheel-scroll-smoothness-requirements.md
- Related code: `tui/src/libs/terminal/mouse.ts`, `tui/src/components/HomeScreen/HomeScreenView.tsx`, `tui/src/components/HomeScreen/wheelRouting.ts`, `tui/src/state/ui/atoms.ts`
