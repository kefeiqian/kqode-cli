---
date: 2026-07-12
topic: tui-modeless-selection
---

# TUI Mode-less Selection: Copy by Default

## Summary

Remove the `Ctrl+R` copy mode so in-app text selection is always available: a plain left-drag over the transcript selects and auto-copies on mouse release (copy-on-select), click-without-drag keeps its current meaning, and double-/triple-click select a word/line. This matches Claude Code's fullscreen-renderer selection model on KQode's existing alt-screen architecture — no rendering rearchitecture.

---

## Problem Frame

Copying transcript text today requires pressing `Ctrl+R` first to enter copy mode; only then do mouse press/drag/release build the in-app selection that copies on release (`tui/src/state/ui/copyMode.ts`, `tui/src/useGlobalKeys.ts`). The user compares this unfavorably to Claude Code and Copilot CLI, where drag-to-copy just works with no mode.

Investigation showed the mode gate is not architecturally necessary. Claude Code's current fullscreen renderer (verified against its public docs) uses the same architecture KQode already has — alternate screen buffer, captured mouse, in-app viewport scrolling, pinned composer — and still delivers copy-by-default: drag always selects in-app and the selection auto-copies on release. The selection machinery KQode needs already exists on this branch; it is merely gated behind a mode toggle that Claude Code proves is unnecessary. An earlier direction explored in this brainstorm — rearchitecting to normal-buffer scrollback rendering — was dropped once verification showed that model corresponds to Claude Code's *legacy* renderer, not the behavior the user observed and wants.

---

## Requirements

**Mode-less selection**
- R1. A plain left-drag over the transcript body builds the in-app selection with no prior mode toggle; the `Ctrl+R` copy mode (atom, key binding, status hints, help entries) is removed.
- R2. When the left button is released after a drag, the selected text is copied to the system clipboard automatically (copy-on-select), preserving the current copy-mode release behavior as the default.
- R3. When a left-click is released without dragging, no selection is made and no copy occurs; click keeps its current meanings (composer caret positioning; other click targets unchanged).
- R4. While a selection is being dragged or is highlighted, wheel scrolling and body scroll keys continue to scroll the transcript, as they do in today's copy mode.
- R5. The selection highlight is dismissed without side effects by the existing gestures (any key press, or right-click — which also still pastes); dismissal never re-introduces a mode.

**Multi-click gestures**
- R6. Double-click selects the word under the pointer and copies it (same copy-on-select path as drag).
- R7. Triple-click selects the whole rendered line under the pointer and copies it.

**Key ownership**
- R8. `Ctrl+O` copy-last-response and the `Ctrl+C` two-step armed exit are unchanged; `Ctrl+R` becomes unbound (free for future use).
- R9. Status-bar and help text no longer reference copy mode; if a hint is shown, it describes drag-to-copy directly.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given normal interaction (no mode toggled), when the user drags across two rows of transcript text and releases, the dragged text is highlighted during the drag and lands on the system clipboard on release.
- AE2. **Covers R3.** Given normal interaction, when the user clicks inside the composer without dragging, the caret moves to the click position, nothing is highlighted, and the clipboard is untouched.
- AE3. **Covers R4.** Given a drag in progress, when the user scrolls the wheel, the transcript scrolls and the selection anchor remains correct.
- AE4. **Covers R5.** Given a highlighted selection, when the user presses any key, the highlight clears and the key otherwise behaves normally.
- AE5. **Covers R6, R7.** Given transcript text `error in src/main.rs line 4`, double-clicking a word selects and copies that word; triple-clicking selects and copies the whole line.
- AE6. **Covers R8.** Given the change, `Ctrl+R` does nothing, `Ctrl+O` still copies the last response, and `Ctrl+C` twice still exits.

---

## Success Criteria

- The user can copy any visible transcript text with a single drag gesture, with no mode key, matching the muscle memory they have from Claude Code.
- Click-to-caret, wheel scrolling (including the smoothness work), right-click paste, pinned chrome, and live theme restyle all behave exactly as before — this change removes a gate, it does not alter the architecture.
- A downstream planner can implement this without re-deciding the selection model (in-app, copy-on-select) or the gesture disambiguation (click vs drag vs multi-click).

---

## Scope Boundaries

- No rendering rearchitecture — the alternate-screen, app-owned-viewport model stays (decided after verifying Claude Code's fullscreen renderer uses the same model).
- No terminal-native selection path; Shift+drag native selection is a terminal-provided bypass that needs no code (optionally mentioned in help).
- No copy-on-select toggle or config setting this round — copy-on-select is always on (Claude Code offers a toggle; deferred until someone wants it).
- No transcript/search mode or dump-to-native-scrollback (Claude Code's `Ctrl+O` transcript mode) — candidate for its own brainstorm.
- No `Ctrl+Shift+C` manual copy binding (terminals swallow it; unchanged from the 2026-07-05 brainstorm).
- No selection support inside the composer beyond what exists today; selection covers the transcript body.

---

## Key Decisions

- **Remove the mode, keep the mechanism:** the in-app selection built for copy mode already does press/drag/release selection with copy-on-release; this change makes it the default gesture instead of a moded one. Verified as exactly Claude Code's fullscreen-mode design ("selected text copies to your clipboard automatically on mouse release").
- **Full rearchitecture rejected:** the normal-buffer scrollback model matches Claude Code's legacy renderer; its fullscreen replacement — the behavior the user actually observed (pinned composer, click-to-caret, default copy) — shares KQode's current architecture, so the rearchitecture would have moved away from the target, not toward it.
- **Click vs drag disambiguation over a modifier key:** press-without-movement keeps click semantics (caret), movement while held means selection — standard GUI text-box behavior, no new key to learn.
- **Copy-on-select always on, no setting:** smallest version that delivers the value; a toggle is cheap to add later if auto-copy ever annoys.

---

## Dependencies / Assumptions

- Builds on the in-app selection subsystem on branch `feat/tui-composer-scroll` (selection state, `BodyPane` highlight overlay, SGR drag parsing in `tui/src/libs/terminal/mouse.ts`), **including currently uncommitted working-tree changes** to `copyMode.ts`, `useGlobalKeys.ts`, and related files — these must be committed before implementation starts in a fresh worktree.
- Assumes the existing clipboard-write path used by copy mode's release-copy works unchanged when invoked outside the mode — verified plausible (same code path), to confirm in planning.
- Multi-click detection (double/triple) requires timing/position tracking over SGR press events; SGR reports carry no click count — new logic, feasibility assumed based on standard terminal-app practice (Claude Code implements it on the same protocol).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] The exact drag threshold: any motion report between press and release, or a minimum cell distance, to avoid twitchy clicks becoming one-cell selections.
- [Affects R6][Technical] Word-boundary rules for double-click (whitespace-delimited runs vs punctuation-aware; Claude Code treats a file path as one word — pick one and document it).
- [Affects R5][Technical] Whether Esc should clear the selection without its usual surface-dismissal side effect when a selection is active, or behave normally.
- [Affects R6, R7][Technical] Double/triple-click timing window and whether the position must be identical between clicks.
