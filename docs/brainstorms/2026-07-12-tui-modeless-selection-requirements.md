---
date: 2026-07-12
topic: tui-modeless-selection
---

# TUI Modeless Selection: Keyboard Copy

## Summary

Keep transcript selection modeless and add keyboard copy for the active selection. A highlighted transcript selection can be copied with `Ctrl+C` on Windows, macOS, and Linux, and with `Command+C` on macOS when the terminal forwards it; when no selection is active, `Ctrl+C` keeps its existing two-step exit behavior.

---

## Problem Frame

KQode now owns transcript selection in-app: drag, double-click, and triple-click create a highlighted body selection while release only finalizes the highlight. Copying that selection is currently manual through right-click, which writes the reconstructed transcript text to the system clipboard and clears the highlight.

Right-click-only copy leaves a keyboard ergonomics gap. Users expect `Ctrl+C` to copy selected text, and macOS users also expect `Command+C`. The TUI already uses `Ctrl+C` for two-step exit, so the selected-text case needs an explicit precedence rule: selection copy wins only while a non-empty transcript selection is active; otherwise exit is unchanged.

The same clipboard-parity lens applies to help text. Paste already accepts a meta/Command-style `V` when the terminal forwards it, but the help surface only documents `Ctrl+V / Alt+V`, so macOS clipboard behavior is under-documented.

---

## Requirements

**Selection model**
- R1. Transcript selection stays modeless: drag, double-click, and triple-click create or update a highlighted transcript selection without entering a copy mode.
- R2. Mouse release finalizes the highlight and does not copy automatically.
- R3. Right-click keeps copying the active transcript selection through the existing clipboard path, then dismissing the highlight.

**Keyboard copy**
- R4. When a non-empty transcript selection is active, `Ctrl+C` copies that selected text on Windows, macOS, and Linux instead of arming exit.
- R5. On macOS, `Command+C` also copies the active transcript selection when the terminal/runtime forwards that key event to the TUI.
- R6. Keyboard selection copy uses the same selected-text reconstruction and clipboard seam as right-click copy, so copied text excludes KQode chrome and preserves wrapped-text fidelity.
- R7. After a handled keyboard selection-copy action, the highlight is dismissed and the user sees the same success or failure feedback used for selection copy today.

**Key ownership and help**
- R8. When there is no non-empty transcript selection, `Ctrl+C` keeps the existing two-step armed-exit behavior.
- R9. `Ctrl+O` copy-last-response remains unchanged and does not gain a `Command+O` alias in this scope.
- R10. Help text documents selected-text keyboard copy with `Ctrl+C`, macOS `Command+C` where supported, and the existing `Command+V` paste path where supported.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R4, R7.** Given transcript text is highlighted, when the user presses `Ctrl+C`, the selected transcript text is written to the clipboard, the highlight clears, and exit is not armed.
- AE2. **Covers R5, R7.** Given transcript text is highlighted on macOS and the terminal forwards `Command+C`, when the user presses `Command+C`, the selected transcript text is written to the clipboard and the highlight clears.
- AE3. **Covers R8.** Given no transcript selection is active, when the user presses `Ctrl+C` once, the status bar shows the existing press-again-to-exit hint; pressing `Ctrl+C` again exits as before.
- AE4. **Covers R3, R6.** Given transcript text is highlighted, when the user right-clicks or uses a keyboard copy shortcut, both paths copy the same reconstructed text.
- AE5. **Covers R7.** Given the clipboard write fails, when the user triggers keyboard selection copy, KQode shows the selection-copy failure hint and keeps running.
- AE6. **Covers R9, R10.** Given the help screen is opened after the change, it still lists `Ctrl+O` for copy-last-response and documents macOS clipboard shortcuts without implying broad macOS aliases for every shortcut.

---

## Success Criteria

- Users can select transcript text once and copy it with the expected keyboard shortcut on their platform.
- `Ctrl+C` remains a reliable exit path when there is no active selection.
- Right-click copy, `Ctrl+O` copy-last-response, paste, scroll, and composer caret behavior remain unchanged.
- The help screen accurately reflects clipboard shortcuts for Windows, macOS, and Linux without over-promising terminal behavior KQode cannot observe.

---

## Scope Boundaries

- No copy mode is reintroduced.
- No terminal-native selection rework; in-app transcript selection remains the model.
- No composer text selection support in this scope.
- No copy-on-release behavior; release highlights only.
- No broad macOS keymap parity such as `Command+O` for copy-last-response.
- No enhanced keyboard-protocol negotiation to force terminals to send `Command+C`; support is best effort when the event reaches the app.

---

## Key Decisions

- **Selection-first `Ctrl+C`:** an active selection is a stronger copy intent than exit intent, so selection copy wins only while non-empty transcript text is highlighted.
- **Clipboard shortcuts only for macOS parity:** this scope adds `Command+C` for selected text and documents `Command+V` paste where supported, without converting every shortcut to a macOS alias.
- **Reuse the existing selection-copy path:** keyboard copy should share right-click copy's selected-text reconstruction, clipboard seam, and feedback behavior rather than create a parallel clipboard path.
- **Exit fallback stays unchanged:** preserving `Ctrl+C` two-step exit with no selection keeps the global escape hatch predictable.

---

## Dependencies / Assumptions

- In-app selection is already modeless and release does not copy automatically (`tui/src/components/HomeScreen/selectionInput.ts:77-84`, `tui/src/components/HomeScreen/selectionInput.ts:113-124`, `tui/src/__tests__/components/HomeScreen.test.tsx:547-575`).
- Right-click copy already routes through `copySelection`, then clears the highlight (`tui/src/components/HomeScreen/useHomeScreenInput.ts:148-155`, `tui/src/__tests__/App.test.tsx:185-206`).
- `copySelection` already reconstructs text from body rows and writes through the injected clipboard seam with success/failure hints (`tui/src/components/HomeScreen/copySelection.ts:13-51`, `tui/src/components/HomeScreen/__tests__/copySelection.test.ts:24-80`).
- `Ctrl+C` is currently owned by `useGlobalKeys` as two-step exit, and selection dismissal is non-consuming before normal key handling continues (`tui/src/useGlobalKeys.ts:8-25`, `tui/src/useGlobalKeys.ts:34-68`).
- Paste already recognizes meta/Command-style `V` when delivered (`tui/src/components/PromptComposer/input/handlePaste.ts:44-47`), while help currently documents only `Ctrl+V / Alt+V` (`tui/src/components/HelpScreen/helpContent.ts:41-45`).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Confirm the exact Ink key shape for `Command+C` across target macOS terminals and add tests for the event form KQode can observe.
- [Affects R7][Technical] Decide whether a failed clipboard write should clear the highlight exactly like right-click does today, or preserve the highlight so the user can retry.
