---
title: "feat: Add TUI selected-text keyboard copy"
type: feat
date: 2026-07-13
origin: docs/brainstorms/2026-07-12-tui-modeless-selection-requirements.md
---

# feat: Add TUI Selected-Text Keyboard Copy

## Summary

Add keyboard copy for the active transcript selection in the Ink TUI. `Ctrl+C` copies selected transcript text across platforms, macOS `Command+C` copies when forwarded by the terminal, and `Ctrl+C` keeps the existing two-step exit path when no non-empty selection is active.

---

## Problem Frame

Transcript selection is already modeless and app-owned, but the selected text can only be copied with right-click. That misses the expected keyboard copy path and creates a conflict with the existing global `Ctrl+C` exit behavior. The implementation must make selected-text copy take precedence only while a non-empty transcript selection is active, without changing paste, right-click copy, copy-last-response, or composer editing behavior.

---

## Requirements

**Selection copy**
- R1. A non-empty active transcript selection can be copied with `Ctrl+C` on Windows, macOS, and Linux.
- R2. A non-empty active transcript selection can be copied with macOS `Command+C` when the terminal/runtime forwards that key to the TUI.
- R3. Keyboard selection copy and right-click selection copy use the same selected-text reconstruction and clipboard seam.
- R4. A handled selection-copy attempt clears the highlight and reports the existing selection-copy success or failure hint.

**Key ownership**
- R5. With no non-empty transcript selection, `Ctrl+C` keeps the existing two-step armed-exit behavior.
- R6. `Ctrl+O` copy-last-response remains unchanged and does not gain a macOS `Command+O` alias.

**Help and parity**
- R7. The help screen documents selected-text keyboard copy, macOS `Command+C` support where forwarded, and the existing macOS `Command+V` paste path where forwarded.

---

## Key Technical Decisions

- **KTD1. Selection copy runs before generic selection dismissal:** `useGlobalKeys` currently clears active selections before normal key handling continues, so the copy shortcut must be checked before that dismissal or the reusable copy path will see no selection.
- **KTD2. `Ctrl+C` keeps exit as the no-selection fallback:** `copySelection` already returns `false` for no or collapsed selection, letting the existing armed-exit branch remain the fallback without duplicating selection-empty checks.
- **KTD3. macOS `Command+C` is an observed-key shortcut, not protocol negotiation:** implement the forwarded meta/Command form KQode can observe, and do not add enhanced keyboard protocol negotiation or broad macOS aliases.
- **KTD4. Clearing on accepted copy attempt matches right-click:** once the copy action is accepted by the TUI, clear the selection immediately like right-click does today; asynchronous clipboard failure is reported with the existing failure hint rather than preserving retry state.
- **KTD5. Help updates stay centralized:** update the canonical help keybinding data and its tests rather than adding ad-hoc shortcut hints elsewhere.

---

## Implementation Units

### U1. Define selected-copy shortcut detection

- **Goal:** Add a small, testable predicate for selected-text keyboard copy so `Ctrl+C` and macOS `Command+C` behavior is explicit and not mixed into the global hook.
- **Requirements:** R1, R2, R5, R6
- **Dependencies:** None
- **Files:**
  - `tui/src/libs/keyboard/clipboardShortcuts.ts`
  - `tui/src/libs/keyboard/__tests__/clipboardShortcuts.test.ts`
- **Approach:** Create a pure helper that treats `input === "c" && key.ctrl === true` as universal selected-copy, and treats `input === "c" && key.meta === true` as selected-copy only for macOS. Accept an injectable platform value for tests while defaulting to the runtime platform in production.
- **Patterns to follow:** Keep pure logic under `tui/src/libs/` per `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`; mirror `handlePaste`'s existing use of `key.meta` for forwarded clipboard shortcuts.
- **Test scenarios:**
  - `Ctrl+C` returns true on every platform.
  - `meta+C` returns true when the platform is macOS.
  - `meta+C` returns false on non-macOS platforms so Linux/Windows Alt+C does not become a hidden copy shortcut.
  - `Ctrl+O`, `Command+O`, and unrelated modified keys return false.
- **Verification:** The shortcut helper has deterministic unit coverage for platform and modifier combinations.

### U2. Route selected-copy before Ctrl+C exit handling

- **Goal:** Make the global key handler copy a non-empty active transcript selection before any selection-dismissal or exit logic runs.
- **Requirements:** R1, R2, R3, R4, R5
- **Dependencies:** U1
- **Files:**
  - `tui/src/useGlobalKeys.ts`
  - `tui/src/__tests__/App.test.tsx`
  - `tui/src/components/HomeScreen/__tests__/copySelection.test.ts`
- **Approach:** In `useGlobalKeys`, check the selected-copy predicate before the existing generic keypress selection dismissal. If `copySelection(store)` returns `true`, clear the selection, clear any pending exit arm, and return. If it returns `false`, fall through so collapsed selections and no-selection states keep the existing `Ctrl+C` exit behavior.
- **Patterns to follow:** Reuse `copySelection` from `tui/src/components/HomeScreen/copySelection.ts` so keyboard and right-click copy share text reconstruction, clipboard injection, and transient hints; keep clipboard side effects behind `clipboardClientAtom` as documented in `tui/AGENTS.md`.
- **Test scenarios:**
  - Covers origin AE1. With a non-empty selection and fake clipboard, `Ctrl+C` writes the selected text, clears the selection, and does not arm exit.
  - Covers origin AE2. The selected-copy predicate accepts macOS `Command+C`; if full Ink event simulation is not practical, the direct helper test proves the forwarded key shape.
  - Covers origin AE3. With no selection, first `Ctrl+C` still arms exit and second `Ctrl+C` exits.
  - With a collapsed selection, `Ctrl+C` does not write to the clipboard and falls through to the existing exit arm.
  - With an already armed exit and then a non-empty selection, selected-copy clears the pending exit arm so the next `Ctrl+C` does not unexpectedly exit.
  - Covers origin AE5. When the clipboard seam is missing or returns failure, the existing failure hint is shown, the highlight clears, and KQode keeps running.
- **Verification:** App-level tests demonstrate selected-copy precedence and no-selection exit fallback, while existing copy-selection unit tests continue to prove text reconstruction and failure hints.

### U3. Update help and shortcut documentation tests

- **Goal:** Make the help screen accurately describe selected-text copy and macOS clipboard parity without implying broad macOS aliases.
- **Requirements:** R6, R7
- **Dependencies:** U1, U2
- **Files:**
  - `tui/src/components/HelpScreen/helpContent.ts`
  - `tui/src/components/HelpScreen/__tests__/helpContent.test.ts`
- **Approach:** Update the CLIPBOARD and SELECTION help entries so selected text lists `ctrl+c` plus macOS `cmd+c` where supported, paste lists the existing `ctrl+v / alt+v` path plus macOS `cmd+v` where supported, and copy-last-response remains `ctrl+o` only.
- **Help wording:** Qualify the global `ctrl+c x2` exit row as applying when no transcript selection is active, and qualify the selection-dismissal row so copy shortcuts are not described as generic dismissal-only keys.
- **Patterns to follow:** Keep shortcut copy in the centralized `KEYBINDING_SECTIONS` array and assert the flattened output in the existing help tests.
- **Test scenarios:**
  - Global help says `Ctrl+C` exits only when no transcript selection is active.
  - Help includes selected-text keyboard copy and right-click copy.
  - Help includes macOS `cmd+c` and `cmd+v` wording where supported.
  - Help still includes `ctrl+o` for copy-last-response and does not include `cmd+o`.
  - Selection-dismissal help does not contradict copy shortcuts or scroll-preserving keys.
  - Help still does not mention `ctrl+r` or Copy Mode.
- **Verification:** Help-content tests fail if shortcut documentation drifts from the scoped keymap.

---

## Acceptance Examples

- AE1. **Covers R1, R3, R4.** Given transcript text is highlighted, when the user presses `Ctrl+C`, the selected transcript text is written to the clipboard, the highlight clears, and exit is not armed.
- AE2. **Covers R2, R4.** Given transcript text is highlighted on macOS and the terminal forwards `Command+C`, when the user presses `Command+C`, the selected transcript text is written to the clipboard and the highlight clears.
- AE3. **Covers R5.** Given no transcript selection is active, when the user presses `Ctrl+C` once, KQode shows the existing press-again-to-exit hint; pressing `Ctrl+C` again exits as before.
- AE4. **Covers R3.** Given transcript text is highlighted, when the user right-clicks or uses a keyboard copy shortcut, both paths copy the same reconstructed text.
- AE5. **Covers R4.** Given the clipboard write fails, when the user triggers keyboard selection copy, KQode shows the selection-copy failure hint and keeps running.
- AE6. **Covers R6, R7.** Given the help screen is opened, it lists `Ctrl+O` for copy-last-response, documents selected-text keyboard copy, and documents macOS clipboard shortcuts without implying broad macOS aliases.

---

## Scope Boundaries

- No copy mode is reintroduced.
- No terminal-native selection rework is included.
- No composer text selection support is included.
- No copy-on-release behavior is added.
- No broad macOS keymap parity is added beyond clipboard copy/paste wording and selected-copy handling.
- No enhanced keyboard protocol negotiation is added for terminals that do not forward `Command+C`.

---

## Risks & Dependencies

- **Terminal forwarding variance:** macOS `Command+C` may be swallowed by some terminals. The implementation should support the forwarded event shape KQode can observe and avoid promising behavior when the terminal never sends the key.
- **Exit regression risk:** selected-copy must not make no-selection `Ctrl+C` unreliable, because it is the TUI's global escape hatch.
- **Clipboard failure behavior:** clearing the highlight on accepted copy attempt is intentional parity with right-click, but the failure hint must still appear so the user knows the copy did not land.

---

## Sources & Research

- Origin requirements: `docs/brainstorms/2026-07-12-tui-modeless-selection-requirements.md`
- TUI selection/copy rules: `tui/AGENTS.md`
- Global key ownership: `tui/src/useGlobalKeys.ts`
- Composer Ctrl+C exclusion: `tui/src/components/PromptComposer/usePromptComposerInput.ts`
- Selection copy path: `tui/src/components/HomeScreen/copySelection.ts`
- Right-click copy routing: `tui/src/components/HomeScreen/useHomeScreenInput.ts`
- Selected-text reconstruction: `tui/src/libs/selection/selectedText.ts`
- Existing meta paste handling: `tui/src/components/PromptComposer/input/handlePaste.ts`
- Help shortcut source: `tui/src/components/HelpScreen/helpContent.ts`
- Applicable learning: `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`
- Applicable learning: `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
