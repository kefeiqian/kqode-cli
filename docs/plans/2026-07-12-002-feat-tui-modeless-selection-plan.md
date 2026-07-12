---
title: "feat: Mode-less in-app selection — drag-to-copy by default in the TUI"
type: feat
status: active
date: 2026-07-12
---

# feat: Mode-less in-app selection — drag-to-copy by default in the TUI

## Summary

Remove the `Ctrl+R` copy-mode gate so the in-app selection built by `docs/plans/2026-07-11-001-feat-tui-in-app-selection-copy-plan.md` is always active: a plain left-drag over the transcript selects and auto-copies on release, click-without-drag keeps its current meanings, and double-/triple-click select a word/line. Matches Claude Code's fullscreen-renderer selection model (see origin: `docs/brainstorms/2026-07-12-tui-modeless-selection-requirements.md`).

---

## Problem Frame

Copying transcript text requires pressing `Ctrl+R` before dragging; Claude Code's fullscreen renderer proves the same architecture (captured mouse, alt screen, in-app viewport) needs no mode — drag always selects, and the selection copies on release. All the machinery exists on this branch behind `copyModeActiveAtom`; the mode is pure friction.

---

## Requirements

Carried from the origin document:

- R1. Plain left-drag over the transcript body selects with no mode toggle; the `Ctrl+R` copy mode is removed.
- R2. Release after a drag copies the selected text automatically (copy-on-select stays the default).
- R3. Click released without dragging makes no selection, copies nothing, and keeps current click meanings (composer caret positioning).
- R4. Wheel and body scroll keys keep scrolling while a selection is dragged or highlighted.
- R5. The highlight is dismissed by any key press or right-click (which still pastes); dismissal never re-introduces a mode.
- R6. Double-click selects and copies the word under the pointer.
- R7. Triple-click selects and copies the whole rendered line.
- R8. `Ctrl+O` and the `Ctrl+C` armed exit are unchanged; `Ctrl+R` becomes unbound.
- R9. Status-bar/help text describes drag-to-copy, not copy mode.

Origin acceptance examples AE1–AE6 are enforced by the per-unit test scenarios below (`Covers AE<N>` links).

---

## Scope Boundaries

Carried from origin:

- No rendering rearchitecture; the alt-screen, app-owned-viewport model stays.
- No terminal-native selection path (Shift+drag remains the terminal-provided bypass; optionally mentioned in help).
- No copy-on-select toggle/config this round.
- No transcript/search mode or dump-to-native-scrollback.
- No `Ctrl+Shift+C` binding.
- No selection inside the composer; selection covers the transcript body only.

### Deferred to Follow-Up Work

- Drag-to-auto-scroll past the viewport edge (carried from the 2026-07-11 plan's deferrals).
- Per-segment column-precise highlight over markdown-segmented rows (carried deferral).
- Capturing a mode-less-selection learning in `docs/solutions/` via `/ce-compound` after landing.

---

## Prerequisite

The working tree on `feat/tui-composer-scroll` holds uncommitted changes to the selection subsystem (`tui/src/state/ui/copyMode.ts`, `tui/src/useGlobalKeys.ts`, `tui/src/__tests__/App.test.tsx`, and others). **Commit them on this branch before starting implementation** — every unit below edits on top of them.

---

## Context & Research

### Relevant Code and Patterns

- `tui/src/components/HomeScreen/selectionInput.ts` — `handleSelectionGesture`: press starts, drag extends, release extends and calls `copySelection`. Already clamps to the visible body window. The unit of reuse for U1/U3.
- `tui/src/components/HomeScreen/HomeScreenView.tsx` — the `useInput` router: today branches on `copyModeActive` (selection gestures) vs normal (wheel→scroll, click→caret, right-click→paste). U1 replaces the mode branch with region routing.
- `tui/src/useGlobalKeys.ts` — `Ctrl+R` toggle plus the "any key exits copy mode" gate (swallows the exiting key); right-click exits; scroll keys pass. U2 reworks this into non-consuming dismissal driven by `bodySelectionAtom`.
- `tui/src/state/ui/copyMode.ts` — `copyModeActiveAtom`; deleted in U2.
- `tui/src/state/ui/selection.ts`, `tui/src/state/ui/bodyViewport.ts`, `tui/src/libs/selection/*` (`bounds`, `selectedText`, `highlightRow`), `tui/src/components/HomeScreen/copySelection.ts` — the selection model, reconstruction, highlight, and copy seam. Unchanged in behavior; U3 adds word/line bounds beside them. Display-column↔char-index mapping lives in `tui/src/libs/text/displayWidth.ts` (`indexAtDisplayColumn`).
- `tui/src/constants/ui.ts` (`COPY_MODE_INPUT_KEY`, copy-mode hint), `tui/src/components/HelpScreen/helpContent.ts`, `tui/src/components/StatusBar.tsx` — user-facing strings for U4.
- Empty-selection no-op: `copySelection` skips `writeText` when the selection is empty — this is what makes click-vs-drag disambiguation threshold-free.

### Institutional Learnings

- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` — highlight spans never depend on the reserved final column; keep honoring `INK_CURSOR_ROW_ORIGIN_OFFSET` in row mapping.
- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md` — new pure helpers (`multiClick`, `wordBounds`) live in `libs/selection/`, atom-free, colocated tests, no barrel; verify with the repo's `detect-cycles.mjs`.
- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md` — clipboard writes stay behind the injected `contracts/clipboard` seam; no new OS path.

### External References

- Claude Code fullscreen rendering docs (`code.claude.com/docs/en/fullscreen`, fetched 2026-07-12): drag always selects; "selected text copies to your clipboard automatically on mouse release"; click positions the prompt cursor; double-click selects a word with path-as-one-unit boundaries; triple-click selects the line. Behavioral reference only.

---

## Key Technical Decisions

- **Region routing replaces the mode gate.** A left press in the transcript body starts a selection gesture; a left press in the composer keeps click-to-caret. The gestures never conflicted by kind, only by the mode branch — so the branch is replaced by a bounds check the router already knows how to do (`isInsideSafeChromeBounds` pattern).
- **No drag threshold.** Press starts an empty (anchor = focus) selection; `copySelection` no-ops on empty. A motionless click therefore selects and copies nothing by construction (origin deferred question, resolved).
- **Dismissal is non-consuming.** With a highlight active, a key press clears the selection *and still performs its normal action* (origin AE4) — unlike today's copy mode, which swallows the exiting key. Esc stays untouched by the global handler (composer owns it, per the existing race note); Esc still dismisses because the clear-side-effect runs without consuming.
- **A gesture is owned by where it started.** The press records which region owns the gesture; drags that started in the composer never morph into body selection, and body drags never move the caret.
- **Multi-click is classified from press history.** SGR reports carry no click count, so a pure classifier tracks the last press's timestamp and cell: a second press within ~500 ms and ±1 cell is a double, a third is a triple, then the cycle resets. The clock is injected for testability.
- **Word bounds are whitespace-delimited** so a file path or URL selects as one unit (confirmed at synthesis; matches Claude Code/iTerm2 path-as-unit behavior). Double-click on whitespace selects nothing. Triple-click selects the whole rendered row (not the rejoined logical line — origin R7 says rendered line).
- **Delete `copyModeActiveAtom` rather than repurpose it.** After U1–U2 nothing reads it; keeping a dead mode atom invites the mode back.
- **Copy-on-select stays hardwired** through the existing release→`copySelection` path; no setting this round (origin scope).

---

## Implementation Units

Dependency order: U1 → U2 → U3 → U4 (each builds on the previous; U3 only needs U1).

### U1. Region-routed left gestures — selection always on

**Goal:** Route body-area left press/drag/release to the selection gesture unconditionally; composer-area presses keep click-to-caret; no mode gate in the router.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Prerequisite commit

**Files:**
- Modify: `tui/src/components/HomeScreen/HomeScreenView.tsx`
- Modify: `tui/src/components/HomeScreen/selectionInput.ts`
- Test: `tui/src/components/HomeScreen/__tests__/selectionInput.test.ts`, `tui/src/__tests__/components/HomeScreenMouseTracking.test.tsx`, `tui/src/__tests__/App.test.tsx`

**Approach:**
- In the `useInput` router, replace the `copyModeActive` branch with region routing: left press whose row falls in the body viewport (between `bodyTopAtom` and the composer top) starts a selection gesture via `handleSelectionGesture`; a press in the composer region runs the existing caret positioning. Record the owning region of the in-flight gesture so drag/release events route to whichever gesture began, regardless of the pointer's current row.
- A press in the body also clears any previous highlight before anchoring the new (empty) selection, making click the natural dismissal gesture too.
- Wheel routing, right-click paste, and docked-panel guards are untouched.

**Patterns to follow:** the existing `useInput` mouse routing and bounds guards in `HomeScreenView.tsx`; `handleSelectionGesture`'s clamp-to-viewport behavior.

**Test scenarios:**
- Covers AE1. Happy path: with no mode toggled, press→drag→release across two body rows sets the selection, highlights during the drag, and calls `clipboardClient.writeText` with the clean text.
- Covers AE2. Happy path: click in the composer moves the caret; no selection, no `writeText`.
- Covers AE3. Integration: wheel notches during an active drag scroll the body and the selection (absolute row indices) survives.
- Edge case: click (press+release, no drag) in the body → empty selection, no `writeText`, any previous highlight cleared.
- Edge case: a drag that starts in the composer and crosses into the body never creates a body selection; a body drag that crosses the composer never moves the caret.
- Edge case: press with a docked panel open behaves as today (no selection under panels).

**Verification:** Drag-to-copy works with no prior keypress; composer clicks, wheel, and right-click paste behave exactly as before.

---

### U2. Selection lifecycle keys — delete the mode, non-consuming dismissal

**Goal:** Remove `Ctrl+R` and `copyModeActiveAtom`; drive selection-aware key behavior off `bodySelectionAtom` with dismissal that never swallows the key.

**Requirements:** R1, R5, R8

**Dependencies:** U1

**Files:**
- Modify: `tui/src/useGlobalKeys.ts`
- Delete: `tui/src/state/ui/copyMode.ts`
- Modify: `tui/src/state/ui/index.ts`, `tui/src/constants/ui.ts` (remove `COPY_MODE_INPUT_KEY`)
- Test: `tui/src/__tests__/App.test.tsx`, `tui/src/__tests__/components/StatusBar.test.tsx`

**Approach:**
- Remove the toggle branch and the mode block. New behavior when `bodySelectionAtom` is non-null: SGR mouse input passes through (routing owns it); scroll keys pass through; any other key clears the selection **without returning early**, so the key's normal handling (composer input, armed-exit logic) still runs. Keep the existing Esc carve-out (composer owns Esc) — the clear side effect still fires.
- Right-click dismissal moves to the router (U1's right-click paste path clears the selection before pasting), since `useGlobalKeys` no longer intercepts mouse input.
- `Ctrl+C` armed-exit logic is untouched; first press may both clear a selection and arm exit — acceptable and covered by a scenario.

**Patterns to follow:** the existing armed-action disarm-on-any-key pattern in `useGlobalKeys.ts`.

**Test scenarios:**
- Covers AE6. Happy path: `Ctrl+R` triggers nothing (no atom, no hint); `Ctrl+O` still copies the last response; `Ctrl+C` twice still exits.
- Covers AE4. Happy path: with a highlight active, pressing a printable key clears the highlight and the character still reaches the composer.
- Edge case: with a highlight active, right-click clears the highlight and still pastes.
- Edge case: with a highlight active, `Ctrl+C` clears the selection and arms the exit in the same press; a second `Ctrl+C` exits.
- Edge case: PageUp/PageDown/End with a highlight active scroll without dismissing.

**Verification:** No reference to `copyModeActiveAtom` or `COPY_MODE_INPUT_KEY` remains (grep clean); dismissal never eats a keystroke.

---

### U3. Double-click word / triple-click line selection

**Goal:** Classify rapid successive left presses and expand the selection to the word or rendered line under the pointer, copying through the existing release path.

**Requirements:** R6, R7

**Dependencies:** U1

**Files:**
- Create: `tui/src/libs/selection/multiClick.ts`, `tui/src/libs/selection/wordBounds.ts`
- Test: `tui/src/libs/selection/__tests__/multiClick.test.ts`, `tui/src/libs/selection/__tests__/wordBounds.test.ts`
- Modify: `tui/src/components/HomeScreen/selectionInput.ts` (consume the classifier on press)
- Modify (only if a set-range write helper is missing): `tui/src/state/ui/selection.ts`

**Approach:**
- `multiClick.ts` (pure): given the previous press record `{ at, row, column, count }` and a new press, return the click count (1, 2, or 3, cycling back to 1) using a ~500 ms window and ±1-cell tolerance. Clock injected by the caller.
- `wordBounds.ts` (pure): given a row's display text and a display column, return the `[startCol, endCol)` of the whitespace-delimited run containing that column (wide-char aware via `indexAtDisplayColumn` from `tui/src/libs/text/displayWidth.ts`); return `null` when the column sits on whitespace. Line bounds are `[0, rowDisplayWidth)` of the rendered row.
- In `selectionInput.ts`: on a press classified as double, set anchor/focus to the word bounds; as triple, to the line bounds. The subsequent release flows through the existing `copySelection` call, so the copy needs no new wiring. Single press keeps today's anchor behavior.

**Patterns to follow:** `libs/selection/` pure-helper style with colocated tests (atom-free, no barrel); `tui/src/libs/text/displayWidth.ts` (`indexAtDisplayColumn`) for display-column↔char-index mapping.

**Test scenarios:**
- Covers AE5. Happy path: on the row `error in src/main.rs line 4`, double-click inside `src/main.rs` selects exactly `src/main.rs`; the release writes it to the clipboard.
- Covers AE5. Happy path: a third click within the window selects the whole rendered line; the release copies it.
- Edge case: two presses 600 ms apart → both classify as singles; two presses 3 cells apart → singles.
- Edge case: a fourth rapid press cycles back to a single (new anchor).
- Edge case: double-click on whitespace → no selection, no copy.
- Edge case: word bounds on a CJK/wide-char row land on grapheme boundaries (no split double-width cell).
- Error path: double-click on a blank gap row → no selection, no crash.

**Verification:** Double- and triple-click select and copy word/line; single-click behavior is unchanged; `detect-cycles.mjs` stays clean.

---

### U4. Strings, help, and docs

**Goal:** Remove copy-mode language everywhere a user or future agent reads about selection.

**Requirements:** R9, R8

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `tui/src/constants/ui.ts` (drop/replace the copy-mode hint), `tui/src/components/HelpScreen/helpContent.ts`, `tui/src/components/StatusBar.tsx` (if it still renders a mode hint)
- Modify: `tui/AGENTS.md` (selection is always-on; drag copies on release; multi-click gestures)
- Modify: `docs/plans/2026-07-11-001-feat-tui-in-app-selection-copy-plan.md` (note: the `Ctrl+R` entry decision is superseded by this plan)
- Test: `tui/src/components/HelpScreen/__tests__/helpContent.test.ts`, `tui/src/__tests__/components/StatusBar.test.tsx`

**Approach:** Help describes drag-to-copy, double/triple-click, and keeps `Ctrl+O`; optionally mentions Shift+drag for terminal-native selection. Record the supersession in the 07-11 plan the same way it recorded superseding the 07-05 plan.

**Test scenarios:**
- Happy path: help content lists drag-to-copy and `Ctrl+O`, and contains no `Ctrl+R` selection entry.
- Test expectation: none for `tui/AGENTS.md` and the superseded-plan note — docs-only edits.

**Verification:** No user-facing string mentions copy mode; docs record the reversal chain (07-05 delegate → 07-11 moded in-app → this plan mode-less).

---

## System-Wide Impact

- **Interaction graph:** `HomeScreenView.useInput` (region routing), `useGlobalKeys` (dismissal), `BodyPane` (highlight — unchanged), `StatusBar`/help (strings). The two `useInput` sites must not double-handle: routing owns mouse, global keys own keyboard dismissal.
- **State lifecycle:** `bodySelectionAtom` becomes the only selection state; it must clear on new transcript submission (existing behavior) and now also on body click and key press. Mouse tracking stays always-on with symmetric teardown (unchanged from the 07-11 plan's U5).
- **Unchanged invariants:** wheel scroll and smoothness work, click-to-caret, right-click paste, `Ctrl+O`, `Ctrl+C` armed exit, bracketed paste, theme restyle, pinned chrome, clipboard seam and its UTF-8 encoding fix.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Non-consuming dismissal double-handles a key (clears selection AND composer reacts unexpectedly) | Only the clear side effect fires in `useGlobalKeys`; scenario tests assert the key still lands exactly once in the composer. |
| Accidental copies from twitchy clicks | Empty-selection no-op already guards clicks; a 1-cell drag copies one cell — matching Claude Code's behavior, accepted. |
| Multi-click timing feels off across terminals/remotes | Window and tolerance are constants in `multiClick.ts`, trivially tunable; classifier is pure and fully unit-tested. |
| Body press now clears highlights users wanted to keep | Matches GUI selection conventions (click deselects); highlight is re-creatable in one gesture. |
| Concurrent edits to `HomeScreen`/`useGlobalKeys` files from other sessions | Re-check `git status`/mtimes before committing shared TUI files (per the concurrent-edits learning). |

---

## Sources & References

- Origin: `docs/brainstorms/2026-07-12-tui-modeless-selection-requirements.md`
- Builds on (and partially supersedes): `docs/plans/2026-07-11-001-feat-tui-in-app-selection-copy-plan.md`
- Behavioral reference: Claude Code fullscreen rendering docs (fetched 2026-07-12)
- Learnings: `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`, `.../state-libs-layering-and-cycle-verification-in-the-ink-tui.md`, `.../backend-process-lifecycle-ownership-in-the-ink-tui.md`
- Validation: `cargo xtask tui-typecheck`, `cargo xtask tui-test` (or `npm run typecheck` / `npm test` in `tui/`), `detect-cycles.mjs`
