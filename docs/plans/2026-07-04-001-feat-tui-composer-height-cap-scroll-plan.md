---
title: "feat: Composer height cap, hover-routed scroll, and multi-line navigation"
type: feat
status: completed
date: 2026-07-04
origin: docs/brainstorms/2026-07-04-tui-composer-height-cap-and-scroll-requirements.md
---

# feat: Composer height cap, hover-routed scroll, and multi-line navigation

## Summary

Cap the prompt composer's visible box at `floor(rows/2)` so a long prompt cannot bury the transcript, and give the composer an independent mouse-wheel scroll offset that moves its visible window without moving the text cursor. Route each wheel notch to whichever pane the pointer sits over — using the row coordinate already present in the SGR mouse sequence — falling through to the body when the composer has nothing to scroll. The composer view snaps back to the cursor whenever the user types or moves the cursor. Up/Down arrows navigate between the visual lines of a multi-line prompt.

---

## Problem Frame

The composer can grow to nearly the full terminal height today: `resolveHomeScreenLayout` (`tui/src/libs/tui/layout.ts`) reserves only one body row, so a long prompt hides the transcript. Mouse-wheel scrolling drives the body only (`tui/src/components/HomeScreen/HomeScreenView.tsx` → `scrollBodyByRowsAtom`), and there is no way to wheel-scroll a long prompt. See origin for full framing.

---

## Requirements

- R1. Cap the composer's visible **box** (text + background padding + error reserve) at `floor(rows/2)`; the body receives the remainder. (origin R1, R2, R3)
- R2. Composer content overflowing the cap is scrollable by mouse wheel via an independent offset that does not move the text cursor. (origin R4, R5)
- R3. When the offset scrolls the cursor's row outside the visible window, the terminal cursor is hidden; it reappears when the cursor row is visible again. (origin R6)
- R4. Any text edit or cursor-key press resets the composer scroll to the cursor-follow window (snap-back). (origin R7)
- R5. A single wheel dispatcher routes each notch by the pointer's row, parsed from the mouse sequence; no second `useInput` is added and the composer keeps ignoring mouse input. (origin R8)
- R6. A wheel over the composer region scrolls the composer only when it can scroll; the body is the **default** target for every other position — header, bottom spacer, cwd/command-menu row, status row, a non-scrollable composer (fall-through), and any unmapped/out-of-range pointer row. (origin R9, R10)
- R7. PageUp/PageDown/End keep scrolling the body only. (origin R11)
- R8. A terminal resize re-clamps the composer offset and recomputes cursor visibility on that frame. (plan-time addition; see Key Technical Decisions C3)
- R9. Whenever the composer overflows its cap, it shows a `▲`/`▼` marker on its half-line cap rows when content is hidden above/below — including at rest (e.g. a freshly pasted long prompt shows `▲`), not only while actively scrolling — with no reserved column; a non-overflowing composer shows none. (plan-time addition; see Key Technical Decisions — scroll affordance)
- R10. Up/Down arrows move the text cursor between the visual (wrapped) lines of a multi-line prompt, preserving the visual column; on the first/last visual line they are no-ops for now. The slash-command menu retains Up/Down priority while open. (plan-time addition; command-history traversal via Up/Down is deferred — see Scope Boundaries)

**Origin flows:** F1 (wheel-scroll transcript), F2 (wheel-scroll composer)
**Origin acceptance examples:** AE1 (body scroll), AE2 (composer scroll without moving cursor), AE3 (short-composer fall-through), AE4 (snap-back on type), AE5 (cursor hide/show), AE6 (growth caps at `floor(rows/2)`)

---

## Scope Boundaries

- No modifier-key scrolling (e.g. Shift+wheel); wheel is routed by pointer location only.
- No horizontal scrolling of the composer; soft-wrap is unchanged.
- No click-to-position, selection, or drag — wheel-only, reusing the existing SGR wheel reporting.
- PageUp/PageDown/End are not rerouted to the composer.
- No change to body-transcript scroll behavior or to how the composer grows from one row.

### Deferred to Follow-Up Work

- Capture the composer-internal cursor hide/snap-back pattern in `docs/solutions/` via `/ce-compound` after this lands — the learnings search found this is undocumented territory.
- Command-history traversal via Up/Down (at the composer's top/bottom visual line): future work. This plan implements only in-composer vertical cursor movement (U8) and leaves the boundary seam for the future history handler.

---

## Context & Research

### Relevant Code and Patterns

- **Body-scroll triad to mirror** — `tui/src/state/ui/atoms.ts`: `bodyScrollOffsetRowsAtom` (primitive), `maxBodyScrollOffsetRowsAtom` (clamp selector), `scrollBodyByRowsAtom` (write-only action clamping the delta). `tui/src/components/BodyPane.tsx` re-clamps a stale offset at render — the model for resize safety (R8).
- **Stick-to-bottom reset pattern** — `tui/src/state/backend/atoms.ts` resets `bodyScrollOffsetRowsAtom` to `0` on transcript mutations. Mirror this for the composer offset inside the composer mutation atoms.
- **Composer windowing** — `formatVisiblePromptView` in `tui/src/components/PromptComposer/promptTextView.ts` derives the visible window purely from `cursorIndex` (the single injection point for an offset). `countVisibleComposerRows` computes the box height fed back through `composerRowsAtom`.
- **Cursor placement + the hide seam** — `tui/src/components/PromptComposer/index.tsx` calls `setCursorPosition(...)` (active) or `setCursorPosition(undefined)` (the existing hide branch); `resolveComposerCursorPosition` (`cursorPosition.ts`) maps the visible window to a terminal cell.
- **Wheel input + layout math** — `parseMouseWheelInput` in `tui/src/libs/terminal/mouse.ts` matches but discards the SGR X/Y coordinates; the single wheel `useInput` and mouse-mode enable/disable live in `HomeScreenView.tsx`; `composerTopAtom` (`state/ui/atoms.ts`) = `rows - 1 - composerRows` (0-based first composer row).
- **`useInput` invariant** — `usePromptComposerInput.ts` early-returns on `isMouseInput`; `useGlobalKeys.ts` owns only Ctrl+C; the wheel is consumed only in `HomeScreenView`. Do not add a composer-local `useInput`.

### Institutional Learnings

- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`: the app fills the terminal exactly (`FULLSCREEN_GUARD_ROWS = 0`, `tui/src/state/ui/dimensions.ts`), paired in lockstep with `INK_CURSOR_ROW_ORIGIN_OFFSET = 1` (`tui/src/constants/ui.ts`). Cursor drift from layout-math changes has **no unit-test coverage — it must be verified on a live terminal**. This plan does not change total frame height (the outer box always fills `rows`), so the lockstep pair is untouched, but composer height/windowing changes still require a live cursor-landing check.
- Same doc: prefer `<Box width={columns} backgroundColor>` for full-width fills. New scroll/offset state must stay as plain values in `state/**` (guardrail: `tui/src/__tests__/backendIsolation.test.ts`); logic/effects live in components/libs.

### External References

- None. Built entirely on existing in-repo infrastructure (body scroll, SGR wheel parsing, composer windowing).

---

## Key Technical Decisions

- **C1 — Scroll model (signed offset delta from the cursor-follow baseline).** The offset is a signed number of rows away from today's cursor-follow window: `visStart = clamp(baseStart - offset, 0, lastStart)`. Wheel-up increases the offset (earlier rows), wheel-down decreases it (later rows), and the full prompt `[top..bottom]` is reachable from any resting position with no jump. `offset == 0` is exactly today's cursor-follow behavior, so the cursor is always visible at rest. This is the faithful reading of the brainstorm's "scroll the view like the body; cursor can scroll off-screen; snaps back when you type."
- **C2 — Hover coordinate mapping.** `composerTopAtom` is the composer block's top row (the top half-line), so the composer region is the 0-based rows `[composerTop, rows - 1)` (status row excluded), covering the padding, text, error, and bottom-cap rows. Mapping is `pointerRow0 = mouseRow - 1` (SGR row is 1-based). That `mouseRow - 1` shares an origin with `composerTop` — i.e. `INK_CURSOR_ROW_ORIGIN_OFFSET` (a cursor-baseline artifact) does **not** shift mouse content rows — is an **assumption the pure boundary test cannot verify** (the pure test covers the arithmetic only). The **live boundary check is the sole authoritative gate for this assumption and is required, not optional**: a one-row error misroutes every boundary wheel.
- **C3 — Resize safety.** The offset is not reset on resize (only on edit/cursor-move), so the window resolver clamps `visStart` into range every render (mirroring `BodyPane`), and the next wheel re-clamps the stored offset. This restores cursor visibility and prevents blank rows above the first wrapped row after a row/column change.
- **C4 — Cap unit is the whole box.** `floor(rows/2)` caps the composer **box** (text + `COMPOSER_BACKGROUND_PADDING_ROWS` + `COMPOSER_ERROR_RESERVE_ROWS`), so the text-line cap = `floor(rows/2) - padding - reserve`. This bounds the composer to at most half the terminal; the transcript keeps the remaining rows (≈ a third at `MIN_ROWS` up to just under half at tall terminals, after header/gap/cwd/status chrome), refining origin AE6's "text rows" wording. Taking the `min` with the existing body-preserving cap only ever shrinks the composer, so total rows can never over-subscribe.
- **Fall-through is cursor-independent.** "Can the composer scroll?" = wrapped rows > visible-line cap (independent of cursor position), so a full composer always captures the wheel and a short one always falls through to the body regardless of where the cursor sits.
- **Directional-boundary behavior.** An overflowing composer at its scroll boundary is a no-op (does not fall through); fall-through applies only when the composer cannot scroll at all.
- **Region membership.** The half-line background padding rows and the validation-error row count as composer; the status row counts as body.
- **Body is the default scroll target.** The router scrolls the composer only when the pointer is over the composer region AND it can scroll; every other pointer position — header, bottom spacer, cwd/command-menu row, status row, or any unmapped/out-of-range row — defaults to the body. The body is the robust catch-all, so no wheel notch is ever dropped.
- **Single source of truth for window math.** A pure resolver in `tui/src/libs/composer/` computes the wrapped rows, visible window, `cursorVisible`, `canScroll`, and the `▲`/`▼` edge-marker flags, consumed by the render path, the scroll atoms, and the router — so the render, the clamp, and the fall-through decision cannot drift apart. Placing it in `libs/` lets the `state/` layer use it without importing from `components/`.
- **Scroll affordance — lightweight edge markers (no reserved column).** Render a `▲` on the top half-line cap whenever rows are hidden above and a `▼` on the bottom cap whenever rows are hidden below — driven purely by the geometric `hasHiddenAbove`/`hasHiddenBelow` flags, so a long prompt advertises hidden content **at rest** too (maximizing discoverability), not only after a wheel. Unlike the body's scrollbar this reserves no column, so `inputColumns`/cap/cursor math stays untouched. Place the glyph at a fixed non-final cap cell (the final cell can be dropped on some terminals — the cap is a bare full-width `<Text>`, unlike the body scrollbar's `<Box width>`) and use a color that contrasts with the cap's block band. A non-overflowing composer shows no markers.
- **No-op and fall-through feedback.** The boundary no-op is signalled by the absent edge marker at that edge (nothing hidden that way). A short composer that falls through to the body shows no markers and the transcript visibly scrolls — that movement is the sufficient fall-through cue; no extra signal is added.

---

## Open Questions

### Resolved During Planning

- Origin "clamp math / scroll anchor": resolved as C1 (signed delta from cursor-follow baseline; full range reachable; `offset 0` = cursor-follow).
- Origin "composer-region bounds (padding/status rows)": resolved as C2 + region membership (padding + validation = composer; status = body).
- Origin "where the offset state lives / max-offset computation": offset primitive colocated in `state/ui/composer/atoms.ts` (reset in mutations); derived clamp/`canScroll` in `state/ui/atoms.ts` via the libs resolver.

### Deferred to Implementation

- Exact clamp arithmetic for the signed offset (upper/lower bounds from `baseStart`/`lastStart`) — settle against the resolver while coding.
- The live off-by-one boundary check (C2) and the live cursor-landing check (per the fullscreen-rendering learning) — verified on a real terminal during implementation, since neither is observable through `ink-testing-library` frames.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
# Composer window resolver (pure, libs/composer) — signed offset from cursor-follow baseline
inputColumns = columns - PROMPT_PREFIX.length          # ONE shared width: render, scroll atoms, router
rows       = wrap(text, inputColumns)
lastStart  = max(0, rows.length - maxVisibleLines)
baseStart  = clamp(cursorRow - maxVisibleLines + 1, 0, lastStart)   # today's cursor-follow
visStart   = clamp(baseStart - offset, 0, lastStart)                # offset: + = up (earlier), - = down
cursorVisible = visStart <= cursorRow < visStart + maxVisibleLines  # false => hide the Ink cursor
canScroll     = rows.length > maxVisibleLines                       # cursor-independent -> drives fall-through
hasHiddenAbove = visStart > 0 ; hasHiddenBelow = visStart + maxVisibleLines < rows.length   # drive the ▲/▼ edge markers
# offset == 0  =>  visStart == baseStart  (unchanged current behavior, cursor always visible)

# scrollComposerByRowsAtom(delta): offset += delta, clamped so visStart stays within [0, lastStart]
# offset resets to 0 inside the composer mutation atoms (edit / cursor-move / clear) -> snap-back
# render re-clamps visStart every frame -> resize (R8) needs no explicit reset

# Wheel routing (single dispatcher in HomeScreenView)
pointerRow0  = mouseRow - 1                               # SGR row is 1-based -> 0-based layout row
overComposer = composerTop <= pointerRow0 < rows - 1      # status row excluded
delta        = direction == 'up' ? +STEP : -STEP        # STEP = MOUSE_WHEEL_SCROLL_ROWS, clamped to maxVisibleLines-1 in a small composer
(overComposer && composerCanScroll) ? scrollComposerByRows(delta) : scrollBodyByRows(delta)   # else = body DEFAULT: header/spacer/cwd/menu/status + unmapped rows + non-scrollable composer
```

---

## Implementation Units

### U1. Cap the composer box at `floor(rows/2)`

**Goal:** Bound the composer's visible box to half the terminal so the transcript keeps at least ~half, and unify the duplicated padding constant.

**Requirements:** R1 (origin R1–R3, AE6)

**Dependencies:** None

**Files:**
- Modify: `tui/src/libs/tui/layout.ts`
- Modify: `tui/src/constants/ui.ts`
- Test: `tui/src/libs/tui/__tests__/layout.test.ts`

**Approach:**
- In `resolveHomeScreenLayout`, cap `composerVisibleRows` as `min(existingBodyPreservingCap, floor(rows / DIVISOR) - COMPOSER_BACKGROUND_PADDING_ROWS - COMPOSER_ERROR_RESERVE_ROWS)`, floored at 1. The `min` guarantees the body is never starved (the cap only shrinks the composer).
- Add a named `COMPOSER_MAX_HEIGHT_DIVISOR = 2` in `tui/src/constants/ui.ts` (UX knob, documented). Reconcile the duplicated `COMPOSER_BACKGROUND_PADDING_ROWS`: import it from `constants/ui.ts` in `layout.ts` and delete the local copy.

**Patterns to follow:** existing `resolveHomeScreenLayout` structure and its `Math.max(1, ...)` clamps; constants documented in `constants/ui.ts`.

**Test scenarios:**
- Happy path: `resolveHomeScreenLayout(24, ∞, 3, 1, 0)` → composer box (`composerVisibleRows + padding + reserve`) ≤ 12; body ≥ `24 - 12 - fixed`.
- Happy path: at `rows = 40`, `composerVisibleRows` ≤ `20 - padding - reserve`.
- Edge case: `Covers AE6.` a prompt tall enough to exceed the cap yields `composerVisibleRows` pinned at the cap (does not grow to near-fullscreen).
- Edge case: `rows = 15` (MIN_ROWS) → box ≤ 7, `bodyRows` ≥ 1, total within canvas.
- Edge case: menu-open reflow test still holds (composer cap does not change `bodyRows` menu math beyond the new smaller composer).

**Verification:** Pure layout tests pass; at typical sizes the composer never exceeds half the terminal and the body grows accordingly.

---

### U2. Extract the wheel pointer coordinate in the mouse parser

**Goal:** Expose the SGR pointer row the parser currently discards, so the router can hover-test.

**Requirements:** R5 (origin R8)

**Dependencies:** None

**Files:**
- Modify: `tui/src/libs/terminal/mouse.ts`
- Test: `tui/src/libs/terminal/__tests__/mouse.test.ts` (create)

**Approach:**
- Name the row capture group in `SGR_MOUSE_INPUT_PATTERN` and add `parseMouseWheelEvent(input): { direction: 'up' | 'down'; row: number } | null` (row 1-based; leave the column capture group unnamed/unsurfaced — no current consumer, per YAGNI). Keep `isMouseInput` unchanged. Retire `parseMouseWheelInput` in favor of the richer function (only caller is `HomeScreenView`, updated in U6), or keep it delegating.

**Patterns to follow:** existing regex + `parseMouseWheelInput` button-decode logic (`% 4` wheel normalization).

**Test scenarios:**
- Happy path: `\u001B[<64;1;1M` → `{ direction: 'up', row: 1 }`; `\u001B[<65;10;7M` → `{ direction: 'down', row: 7 }`.
- Edge case: a wheel button with modifier bits still decodes to a plain up/down (not dropped).
- Error path: a release event (`...m`) and a non-wheel button (`< 64`) return `null`; a non-mouse string returns `null`.

**Verification:** Parser returns direction plus the correct 1-based row across the SGR variants above.

---

### U3. Pure composer-window resolver with offset + cursor visibility

**Goal:** Centralize wrap + windowing math in `libs/`, add the signed offset and a `cursorVisible`/`canScroll` signal, and delegate `formatVisiblePromptView` to it.

**Requirements:** R2, R3, R8 (origin R4–R6, AE2, AE5; plan R8 — render-time clamp is the resize-safety mechanism)

**Dependencies:** None

**Files:**
- Create: `tui/src/libs/composer/composerWindow.ts`
- Modify: `tui/src/components/PromptComposer/promptTextView.ts`
- Test: `tui/src/libs/composer/__tests__/composerWindow.test.ts` (create)
- Test: `tui/src/__tests__/components/PromptComposer.test.tsx`

**Approach:**
- Move the wrapping + visible-window logic into a pure `resolveComposerWindow({ text, columns, maxVisibleLines, cursorIndex, offset })` returning `{ text, cursorIndex, cursorVisible, canScroll, minOffset, maxOffset }` following the C1 sketch. `columns` here is the already-prefix-adjusted input width (`columns − PROMPT_PREFIX.length`), computed once by the caller and passed identically by the render, the scroll atoms, and the router so they cannot drift. `offset` defaults to `0` so existing behavior is byte-for-byte unchanged; `minOffset`/`maxOffset` are the signed clamp bounds the scroll action reuses instead of recomputing wrap + cursor row. It also returns `hasHiddenAbove`/`hasHiddenBelow` (`visStart > 0` / `visStart + maxVisibleLines < rows.length`) that drive the U7 edge markers.
- Refactor `formatVisiblePromptView`/`formatVisiblePrompt` to delegate; keep their current signatures working (offset defaults to 0) so U5 is the only wiring change. Export `countWrappedPromptRows` for the state layer (U4).

**Execution note:** Keep the existing `formatVisiblePrompt` unit tests green as a characterization guard before adding offset behavior.

**Technical design:** see High-Level Technical Design (window resolver block).

**Patterns to follow:** current `wrapText`/`resolveCursorRowIndex`/`resolveVisibleCursorIndex` in `promptTextView.ts`; `libs/tui/bodyRows.ts` as the precedent for a pure libs row-counting helper.

**Test scenarios:**
- Happy path: `offset = 0` reproduces the current window for single-line, wrapped, and authored-newline inputs (existing `formatVisiblePrompt` cases stay green).
- Happy path: `Covers AE2.` `offset > 0` on an overflowing prompt shifts the window to earlier rows while the underlying `cursorIndex` is unchanged.
- Edge case: `Covers AE5.` when the offset moves the cursor row outside the window, `cursorVisible` is `false`; scrolling back one row makes it `true`; boundary rows (cursor on first vs one above the first visible row) resolve correctly.
- Edge case: prompt of exactly `maxVisibleLines` rows → `canScroll === false`; `maxVisibleLines + 1` → `canScroll === true`.
- Edge case: offset far beyond range clamps to the top row (no blank rows above); a single long unwrapped token wraps and is reachable.

**Verification:** Resolver unit tests pass; `formatVisiblePrompt` behavior is unchanged at `offset 0`; `cursorVisible`/`canScroll` are correct across boundaries.

---

### U4. Composer scroll-offset state (offset + snap-back + clamp/canScroll)

**Goal:** Add the composer offset primitive with snap-back reset, plus the derived clamp action and fall-through predicate, mirroring the body triad.

**Requirements:** R2, R4, R6 (origin R4, R7, R10, AE3, AE4)

**Dependencies:** U3

**Files:**
- Modify: `tui/src/state/ui/composer/atoms.ts`
- Modify: `tui/src/state/ui/atoms.ts`
- Test: `tui/src/state/ui/composer/__tests__/atoms.test.ts`
- Test: `tui/src/state/ui/__tests__/composerScroll.test.ts` (create)

**Approach:**
- In `state/ui/composer/atoms.ts`: add `composerScrollOffsetRowsAtom = atom(0)` and `set(composerScrollOffsetRowsAtom, 0)` inside `insertComposerTextAtom`, `deleteComposerBackwardAtom`, `moveComposerCursorBackwardAtom`, `moveComposerCursorForwardAtom`, the Up/Down move atoms added in U8, and `clearComposerAtom` (synchronous snap-back; covers typing, horizontal and vertical cursor-move incl. no-op moves, submit/clear/slash-exec via `clearComposerAtom`). Colocating the primitive here (not in `atoms.ts`) avoids a circular import. (`setComposerValidationErrorAtom` is intentionally excluded — today its only caller re-sets an identical message, a guarded no-op; record that in a one-line comment so a future non-insert caller is prompted to reset.)
- In `state/ui/atoms.ts`: add `composerCanScrollAtom` and `scrollComposerByRowsAtom` (write-only action). Derive the wrap width as `inputColumns = get(columnsAtom) − PROMPT_PREFIX.length` (identical to the render in `PromptComposer/index.tsx`) and pass it with `composerStateAtom` + `layout.composerVisibleRows` into the U3 resolver; clamp using the resolver's returned `minOffset`/`maxOffset`. The offset is **signed** (C1): mirror the body triad in *structure only* — `scrollComposerByRowsAtom` clamps the signed offset so `visStart` stays in `[0, lastStart]` and does **not** adopt the body's non-negative `0`=bottom convention.

**Patterns to follow:** the body triad in `state/ui/atoms.ts`; the reset-on-mutation pattern in `state/backend/atoms.ts`; isolated-store atom tests.

**Test scenarios:**
- Happy path: `scrollComposerByRowsAtom(+n)` reveals earlier rows and clamps at the first wrapped row (`visStart` 0); `(-n)` reveals later rows down to the last wrapped row (`visStart` = `lastStart`) and may drive the offset negative (signed offset per C1 — not floored at 0).
- Happy path: `Covers AE4.` after setting a non-zero offset, dispatching any composer text edit or cursor-move atom resets the offset to `0`.
- Edge case: no-op cursor move (Left at index 0) still resets the offset to `0`.
- Edge case: `Covers AE3.` `composerCanScrollAtom` is `false` for a one-row/empty prompt and `true` once wrapped rows exceed the visible-line cap.
- Edge case: a stale over-large offset value is clamped by the action against the current bounds.
- Edge case (wrap parity): `composerCanScrollAtom` flips at the same wrapped-row count the render produces for a full-width line (feed the atom and the rendered frame the same width), guarding the `PROMPT_PREFIX` skew.

**Verification:** Offset resets on every mutation; clamp keeps the offset in range; `canScroll` flips at the overflow boundary.

---

### U5. Wire the offset and cursor-hide into the composer render

**Goal:** Apply the scroll offset to the rendered window and hide the terminal cursor when it scrolls off-window.

**Requirements:** R2, R3, R8 (origin R4–R6, AE2, AE5; plan R8 — resize re-clamp + cursor-visibility recompute)

**Dependencies:** U3, U4

**Files:**
- Modify: `tui/src/components/PromptComposer/index.tsx`
- Test: `tui/src/__tests__/components/PromptComposer.test.tsx`

**Approach:**
- Read `composerScrollOffsetRowsAtom` and pass it into the window computation. When the resolver reports `cursorVisible === false`, take the existing `setCursorPosition(undefined)` branch; otherwise place the cursor from the offset window (both the rendered slice and the cursor position derive from the same offset window).
- No new `useInput`; rendering only. Verify the cursor still lands on the active composer text row at `offset 0` (unchanged path).

**Patterns to follow:** existing cursor wiring in `index.tsx` (`resolveComposerCursorPosition`, `useCursor`); the current `setCursorPosition(undefined)` hide branch.

**Test scenarios:**
- Happy path: `Covers AE2.` with a non-zero offset the rendered frame shows earlier composer rows and the transcript is unchanged.
- Edge case: `Covers AE5.` `resolveComposerCursorPosition` continues to place the cursor correctly on the visible offset window (pure-function assertions), since cursor visibility itself is not observable through `ink-testing-library` frames.
- Edge case: `offset 0` renders identically to today for empty, single-line, wrapped, and multiline prompts (regression guard for existing frame/cursor tests).
- Edge case (`Covers R8`): a resize (rows and columns change) with a stale non-zero offset re-clamps `visStart` into range and recomputes cursor visibility on that frame — no blank rows above the first wrapped row, cursor restored when back in view.

**Verification:** Offset visibly scrolls the composer content; existing cursor-placement tests stay green; cursor lands on the active row at rest (plus one live terminal check per the fullscreen-rendering learning).

---

### U6. Hover-based wheel routing in the single dispatcher

**Goal:** Route each wheel notch to the composer or body by the pointer row, with fall-through when the composer cannot scroll.

**Requirements:** R5, R6, R7 (origin R8–R11, F1, F2, AE1, AE3)

**Dependencies:** U2, U4 (U1 for realistic sizing in integration tests)

**Files:**
- Create: `tui/src/components/HomeScreen/wheelRouting.ts`
- Modify: `tui/src/components/HomeScreen/HomeScreenView.tsx`
- Test: `tui/src/components/HomeScreen/__tests__/wheelRouting.test.ts` (create)
- Test: `tui/src/__tests__/components/HomeScreen.test.tsx`

**Approach:**
- Add a pure `isPointerOverComposer(mouseRow, composerTop, rows)` (and a small `resolveWheelTarget`) implementing C2: `pointerRow0 = mouseRow - 1`, composer region `[composerTop, rows - 1)`.
- In `HomeScreenView`, replace `parseMouseWheelInput` with `parseMouseWheelEvent`. **Body is the default target:** dispatch `scrollComposerByRowsAtom` only when the pointer is over the composer region **and** `composerCanScrollAtom` is true; every other case — header, bottom spacer, cwd/command-menu row, status row, a non-scrollable composer, or an unmapped/out-of-range pointer row — falls to `scrollBodyByRowsAtom`. Leave the PageUp/PageDown/End branches (body-only) untouched (R7).
- Use `MOUSE_WHEEL_SCROLL_ROWS` for the composer delta too, but clamp the effective step to `Math.max(1, Math.min(step, maxVisibleLines - 1))` so a single notch never scrolls a near-full page in a small composer (~4 text lines at `MIN_ROWS`) and never collapses to 0 in the pathological `maxVisibleLines == 1` case.

**Patterns to follow:** the existing wheel `useInput` in `HomeScreenView.tsx`; the body-scroll mouse tests in `HomeScreen.test.tsx`; `composerTopAtom` for the region top.

**Test scenarios:**
- Happy path: `Covers AE1.` a wheel event whose row is above `composerTop` scrolls the body (offset changes; composer offset unchanged).
- Happy path: `Covers F2.` a wheel event whose row is within the composer region, with an overflowing composer, scrolls the composer and leaves the body offset unchanged.
- Edge case: `Covers AE3.` a wheel over the composer region with a non-overflowing composer falls through and scrolls the body.
- Edge case (C2): boundary rows resolve correctly — exactly `composerTop` routes to composer, one row above routes to body, and the status row (`rows - 1`) routes to body. Assert on the pure `isPointerOverComposer` with explicit values (frame harness cannot place a real pointer).
- Edge case (default = body): a wheel over the header, the bottom spacer, the cwd/command-menu row, the status row, or an out-of-range pointer row all scroll the body (the router's catch-all).
- Edge case: an overflowing composer at its scroll boundary is a no-op, not a body fall-through.
- Integration: with the slash menu open (menu replaces the cwd above the composer), a wheel over the menu row scrolls the body and `composerTopAtom` stays invariant (extend the existing composer-top-invariant assertion).
- Edge case (small-composer step): at `MIN_ROWS` a wheel notch does not overshoot the whole prompt in one or two notches (step clamps to `maxVisibleLines - 1`).

**Verification:** Wheeling scrolls the pane under the pointer; short composers fall through; boundary rows route to the correct pane in the pure test; PageUp/PageDown/End still scroll the body.

---

### U7. Composer scroll edge markers

**Goal:** Show `▲`/`▼` markers on the composer's half-line cap rows while content is hidden above/below, without reserving a column.

**Requirements:** R9

**Dependencies:** U3, U5

**Files:**
- Modify: `tui/src/components/PromptComposer/ComposerFrame.tsx`
- Modify: `tui/src/components/PromptComposer/index.tsx`
- Modify: `tui/src/constants/ui.ts`
- Test: `tui/src/__tests__/components/PromptComposer.test.tsx`

**Approach:**
- The composer already renders top/bottom half-line caps (`ComposerHalfLine`, `LOWER_HALF_BLOCK`/`UPPER_HALF_BLOCK`). Overlay a `▲` on the top cap when the resolver reports `hasHiddenAbove` and a `▼` on the bottom cap when `hasHiddenBelow`, replacing one glyph of the same cap row (no reserved column, so `inputColumns`/cap/cursor math is untouched). Place the marker at a fixed non-final cell (avoid the last column — the cap is a bare full-width `<Text>` that can drop its final glyph on WezTerm) and rely on `▲`/`▼` being the same East-Asian-ambiguous width class as the existing `▄`/`▀` cap glyphs (so the cap stays exactly `columns` wide), with a contrasting color. A non-overflowing composer reports neither and shows the plain caps.
- Thread `hasHiddenAbove`/`hasHiddenBelow` from the U3 resolver through `index.tsx` into `ComposerFrame`. Add named marker glyph constants (e.g. `COMPOSER_SCROLL_UP_MARKER`/`COMPOSER_SCROLL_DOWN_MARKER`) to `constants/ui.ts` alongside the scrollbar glyphs.

**Patterns to follow:** `ComposerHalfLine` in `ComposerFrame.tsx`; the `SCROLLBAR_TRACK`/`SCROLLBAR_THUMB` glyph constants in `constants/ui.ts` as the precedent for named affordance glyphs.

**Test scenarios:**
- Happy path: scrolled with rows hidden both above and below → both `▲` and `▼` render on the caps.
- Edge case: at the top boundary → `▲` absent, `▼` present (makes the up-wheel no-op legible); at the bottom boundary → inverse.
- Edge case: a non-overflowing composer renders neither marker (and the wheel falls through to the body).
- Edge case (at rest): an overflowing prompt at `offset 0` with the cursor at the end shows `▲` (content hidden above) and no `▼` — markers indicate hidden content, not active scrolling.
- Edge case: markers never change `inputColumns` — cursor-x and wrap width are identical with and without markers; the cap row stays exactly `columns` wide (no wrap to a second row).

**Verification:** Markers reflect hidden-content state (including at rest), disappear at the respective boundary, and never widen the composer. Add to the U5/U7 live-terminal check list: the cap-row marker renders correctly at the terminal edge (no clip, no wrap, no cursor-row shift).

---

### U8. Vertical (Up/Down) cursor movement in a multi-line composer

**Goal:** Up/Down arrows move the text cursor to the previous/next visual (wrapped) line, preserving the visual column; at the top/bottom line they are no-ops, leaving a seam for future command-history traversal.

**Requirements:** R4, R10

**Dependencies:** U3 (wrap-layout helper), U4 (offset snap-back reset)

**Files:**
- Modify: `tui/src/libs/composer/composerWindow.ts`
- Modify: `tui/src/state/ui/composer/atoms.ts`
- Modify: `tui/src/components/PromptComposer/input/handleCursorMove.ts`
- Test: `tui/src/libs/composer/__tests__/composerWindow.test.ts`
- Test: `tui/src/state/ui/composer/__tests__/atoms.test.ts`

**Approach:**
- Add a pure `resolveVerticalCursorIndex(text, columns, cursorIndex, direction)` to the libs composer module that derives the cursor's current visual (row, col) from the same wrap layout U3 centralizes, then returns the index at (row ± 1, `min(col, targetRowLength)`); it returns `null` when the target visual row does not exist (top/bottom boundary or single line).
- Add `moveComposerCursorUpAtom` / `moveComposerCursorDownAtom` mirroring `moveComposerCursorBackward/ForwardAtom`: they take the wrap width (`inputColumns = columnsAtom − PROMPT_PREFIX.length`, the shared width), set the clamped `cursorIndex` when the helper returns an index, and reset `composerScrollOffsetRowsAtom` to `0` (snap-back, R4). A `null` result is a no-op.
- `handleCursorMove` gains `key.upArrow` / `key.downArrow` branches that fire only when the slash menu is closed; `handleMenuKey` precedes `handleCursorMove` in `COMPOSER_KEY_HANDLERS`, so menu Up/Down still moves the highlight. At the top/bottom boundary the move is a no-op now — note the seam where the future command-history handler will hook the boundary case.
- A persistent goal-column across consecutive Up/Down presses (so passing through a shorter line preserves the original column) is a nice-to-have refinement, not required here.

**Execution note:** Implement the vertical-move helper test-first — its row/column math is the error-prone part.

**Patterns to follow:** `moveComposerCursorBackward/ForwardAtom` (clamp + offset reset); `handleCursorMove` Left/Right branches; the ordered `COMPOSER_KEY_HANDLERS` dispatch where `handleMenuKey` precedes `handleCursorMove`.

**Test scenarios:**
- Happy path: a 3-visual-line prompt with the cursor on line 2 — Up moves to line 1 and Down moves to line 3, at the same visual column.
- Edge case: Up on the first visual line and Down on the last visual line are no-ops (cursor unchanged).
- Edge case: moving onto a shorter line clamps the column to that line's length.
- Edge case: a single-line prompt — Up/Down are no-ops.
- Edge case: Up/Down while the slash menu is open move the menu highlight, not the cursor (handleMenuKey priority).
- Edge case (`Covers R4`): Up/Down while the composer is scrolled reset the offset to the cursor-follow window.

**Verification:** Up/Down navigate visual lines with column preservation; menu keys are unaffected; the scroll snaps back; boundary presses are no-ops.

---

## System-Wide Impact

- **Interaction graph:** the single wheel `useInput` in `HomeScreenView` now dispatches to either `scrollBodyByRowsAtom` or `scrollComposerByRowsAtom`; the composer's single `useInput` dispatcher is unchanged in count — `handleCursorMove` gains Up/Down branches (menu-closed) that run after `handleMenuKey`, preserving the ordered-handler priority — and `useGlobalKeys` is untouched (invariant: exactly one composer `useInput`, and the composer keeps ignoring mouse input).
- **State lifecycle risks:** the composer offset must reset on every text/cursor mutation (snap-back) and re-clamp at render (resize); both are covered by U4 (reset) and U3/U5 (render clamp).
- **Unchanged invariants:** body-transcript scroll, `composerTopAtom` invariance with the menu open, `FULLSCREEN_GUARD_ROWS`/`INK_CURSOR_ROW_ORIGIN_OFFSET` lockstep (total frame height is unchanged), and the one-`useInput`-per-surface rule all stay as-is.
- **Integration coverage:** cursor-hide-on-scroll and the hover boundary are not observable through `ink-testing-library` frames, so they are covered by pure-function/atom tests plus a live terminal check.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cursor lands one row off after composer height/windowing changes (no unit coverage — see learning). | Keep `resolveComposerCursorPosition` pure tests; verify cursor landing on a live terminal at `offset 0` and while scrolled. |
| Off-by-one in the 1-based-mouse → 0-based-layout hover boundary misroutes edge wheels. | Pure `isPointerOverComposer` boundary tests with explicit values + one live boundary check (C2). |
| Concurrent refactors on this branch move files (layout already moved from `state/ui/` to `libs/tui/`). | Plan uses path+symbol references; re-verify each file exists before editing. |
| Circular import between `state/ui/atoms.ts` and `state/ui/composer/atoms.ts`. | Offset primitive lives in `composer/atoms.ts`; only the derived selectors in `atoms.ts` import from it (one-way). |

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-07-04-tui-composer-height-cap-and-scroll-requirements.md`
- Related code: `tui/src/state/ui/atoms.ts`, `tui/src/components/PromptComposer/promptTextView.ts`, `tui/src/components/HomeScreen/HomeScreenView.tsx`, `tui/src/libs/terminal/mouse.ts`, `tui/src/libs/tui/layout.ts`
- Learning: `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`
