---
date: 2026-07-05
topic: tui-copy-paste-and-selection
---

# TUI Copy, Paste, and Text Selection

## Summary

Give the TUI first-class clipboard ergonomics: paste the system clipboard into the composer by right-click and by `Ctrl+V`/`Alt+V`, enable bracketed paste so multi-line pastes stop mis-submitting, add a **Copy Mode** toggle that hands the mouse back to the terminal so its native highlight-select-copy works across the whole screen, and copy the last agent response with `Ctrl+O`. `Ctrl+C` stays the two-step armed exit.

---

## Problem Frame

The TUI enables SGR mouse tracking (`ENABLE_SGR_MOUSE_TRACKING = '\u001B[?1000h\u001B[?1006h'` in `tui/src/libs/terminal/mouse.ts`, written from `HomeScreenView`) so it can route the wheel between panes and position the composer caret on left-click. The side effect is that the terminal no longer performs its own click-drag selection — the user reports that, with the TUI running, dragging the mouse highlights nothing at all, so there is currently no way to select or copy transcript text.

Paste is also unreliable. Bracketed paste is not enabled anywhere in the TUI (no `?2004h`, `200~`, or `201~` in `tui/src`), so pasted text arrives keystroke-by-keystroke, indistinguishable from fast typing. A pasted multi-line snippet therefore hits the composer's Enter handler mid-paste and submits a half-pasted prompt. Right-click does not paste either: with mouse tracking on, the terminal forwards the right-button press to the app (SGR button 2), and the app currently parses only the left button (`LEFT_BUTTON_CODE = 0`) and the wheel, so nothing happens.

There is no clipboard integration in the TUI at all (no read, no write) and no key that copies model output. `Ctrl+C` is already claimed as the global two-step armed exit in `tui/src/useGlobalKeys.ts` (and is deliberately ignored by the composer dispatcher), so the terminal-convention copy/paste keys `Ctrl+Shift+C`/`Ctrl+Shift+V` are unavailable: terminals swallow them for their own copy/paste, and at the byte level `Ctrl+Shift+C` is identical to the armed `Ctrl+C`.

---

## Key Flows

- F1. Paste into the composer
  - **Trigger:** User right-clicks in the TUI, or presses `Ctrl+V` / `Alt+V`, or uses the terminal's own paste.
  - **Actor:** TUI user.
  - **Steps:** For a terminal-driven paste, bracketed paste delivers the clipboard as one atomic chunk → the whole chunk is inserted at the caret, newlines included, without submitting. For right-click or `Ctrl+V`/`Alt+V` reaching the app as a key/mouse event, the app reads the system clipboard and inserts it at the caret.
  - **Outcome:** Clipboard text lands in the composer as a proper (possibly multi-line) prompt; nothing is auto-submitted.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. Select and copy on-screen text (Copy Mode)
  - **Trigger:** User presses the Copy Mode hotkey.
  - **Actor:** TUI user.
  - **Steps:** The TUI disables SGR mouse tracking and shows a status hint → the terminal's native drag-select + highlight + copy work again over the whole screen → the user drags to select and copies with their terminal's own copy action → the user presses Esc (or the exit key) → the TUI re-enables mouse tracking and returns to normal.
  - **Outcome:** The user copies arbitrary visible text using their terminal's familiar selection, then resumes normal mouse interaction.
  - **Covered by:** R6, R7, R8, R9

- F3. Copy the last response
  - **Trigger:** User presses `Ctrl+O`.
  - **Actor:** TUI user.
  - **Steps:** The TUI takes the most recent agent response text → writes it to the system clipboard → shows a brief confirmation (or a graceful failure hint).
  - **Outcome:** The last response is on the clipboard as text without entering Copy Mode or selecting anything.
  - **Covered by:** R10, R11

---

## Requirements

**Paste into the composer**
- R1. While the TUI owns the screen, bracketed paste mode is enabled (`?2004h` on start, disabled on teardown) so pasted text is delivered as one atomic chunk distinct from typed input.
- R2. Pasted content — however it is delivered — is inserted into the composer at the caret verbatim, including newlines, and no newline embedded in a paste is treated as submit.
- R3. A right-click (SGR button 2) pastes the system clipboard into the composer.
- R4. `Ctrl+V` and `Alt+V` paste the system clipboard into the composer via an app-level clipboard read, covering terminals that do not paste on `Ctrl+V` themselves; terminals that do paste on `Ctrl+V` deliver it through bracketed paste instead, so no double paste occurs.
- R5. Clipboard reads are performed in the TUI (TypeScript) layer, not the Rust backend, and a failed read degrades gracefully — no crash, nothing inserted, and a brief status hint.

**Copy Mode (delegated selection)**
- R6. A dedicated hotkey toggles Copy Mode, which disables SGR mouse tracking so the terminal's native click-drag selection, highlight, and copy work again across the whole screen (body and composer).
- R7. While Copy Mode is active, the status bar shows a clear hint describing how to select/copy and how to exit; PageUp / PageDown still scroll the body.
- R8. Copy Mode exits on a defined key (Esc, and/or any key), which re-enables mouse tracking and returns to normal interaction.
- R9. Copy Mode operates on the currently-visible viewport only (the alternate screen has no scrollback); reaching scrolled-off content is done by scrolling before selecting, not by Copy Mode capturing history.

**Copy the last response**
- R10. `Ctrl+O` copies the most recent agent response to the system clipboard as text, without requiring Copy Mode or a manual selection.
- R11. Clipboard writes are performed in the TUI layer; a failed write degrades gracefully with a status hint.

**Key ownership**
- R12. `Ctrl+C` remains the two-step armed exit and is unaffected; none of the new keys reuse or interfere with it, and `Ctrl+Shift+C` / `Ctrl+Shift+V` are intentionally not bound.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a multi-line snippet on the clipboard, when the user pastes it into the composer, all lines appear in the composer as one prompt and nothing is submitted.
- AE2. **Covers R3.** Given text on the clipboard, when the user right-clicks in the TUI, that text is inserted into the composer at the caret.
- AE3. **Covers R4.** Given a terminal that sends a raw `Ctrl+V` key (does not paste itself), when the user presses `Ctrl+V`, the app reads the clipboard and inserts it; given a terminal that pastes on `Ctrl+V`, the same keypress results in exactly one insertion (via bracketed paste), not two.
- AE4. **Covers R6, R7.** Given normal interaction, when the user presses the Copy Mode hotkey, mouse tracking is disabled, a status hint appears, and dragging the mouse produces the terminal's native highlight.
- AE5. **Covers R8.** Given Copy Mode is active, when the user presses the exit key, mouse tracking is re-enabled and wheel/click interaction resumes.
- AE6. **Covers R10.** Given at least one completed agent response, when the user presses `Ctrl+O`, the last response's text is on the system clipboard.
- AE7. **Covers R5, R11.** Given the clipboard mechanism is unavailable, when the user triggers a paste or `Ctrl+O`, the TUI shows a brief failure hint and continues running normally.
- AE8. **Covers R12.** Given any of the new copy/paste keys have been used, when the user presses `Ctrl+C` once then again, the two-step armed exit still behaves exactly as before.

---

## Success Criteria

- The user can paste multi-line text into the composer with no premature submit, by right-click and by keyboard.
- The user can select and copy any on-screen text using their terminal's familiar highlight, without the TUI fighting for the mouse — the same experience they already get in terminals that do not capture the mouse.
- The user can copy the last agent response with a single reliable key.
- `Ctrl+C` exit behavior is unchanged and no new binding collides with it.
- A downstream implementer can build this without re-deciding the selection model (delegated vs. custom), the paste-correctness mechanism (bracketed paste), the clipboard layer (TUI-side), or the key bindings.
- After the change, the Ink composer cursor still lands on the active composer text row across window sizes (per the `tui/AGENTS.md` cursor-placement rule).

---

## Scope Boundaries

- No custom in-app selection rendering or highlight — selection is delegated to the terminal via Copy Mode; the TUI does not draw selected cells itself.
- No `Ctrl+Shift+C` / `Ctrl+Shift+V` bindings (swallowed by terminals and byte-identical to the armed `Ctrl+C`).
- No motion mouse tracking (`?1002h`) or drag-range tracking is introduced; the existing press/release + wheel reporting is unchanged outside the Copy Mode toggle.
- No image paste from the clipboard.
- No huge-paste `[Pasted N lines]` placeholder/collapse UX.
- No paste-burst detection for terminals lacking bracketed paste; correctness relies on bracketed paste, which the target terminals support.
- No SSH/remote clipboard via OSC 52; local system clipboard only.
- No enhanced keyboard protocol negotiation (Kitty keyboard protocol / CSI-u / `modifyOtherKeys`).
- No drag-and-drop file-path → `@path` conversion.

---

## Key Decisions

- **Copy Mode (terminal-native selection) over a custom in-app highlight renderer:** delivers the same background-highlight UX the terminal already draws, at a fraction of the cost and risk, and works uniformly for the scrollable transcript and the editable composer. Both reference agents examined (Codex CLI, Gemini CLI) reached the same conclusion; Gemini's Ink implementation uses this exact toggle.
- **Reliable keybindings (`Ctrl+V`/`Alt+V` paste, `Ctrl+O` copy) over the requested `Ctrl+Shift+V`/`Ctrl+Shift+C`:** the requested combos are intercepted by terminals or indistinguishable from the armed `Ctrl+C`, so they cannot be delivered reliably to the app.
- **Clipboard access lives in the TUI (TypeScript) layer, not the Rust backend:** clipboard is a presentation concern tied to the composer and transcript, matching KQode's "TypeScript owns rich surfaces" boundary and Gemini's approach.
- **Bracketed paste as the paste-correctness foundation, complementary to app-level `Ctrl+V` read:** terminals that paste on `Ctrl+V` deliver the content via bracketed paste; terminals that instead forward the raw key are handled by the app-level read — the two paths cover the full terminal range without double-pasting.
- **`Ctrl+O` copies the last response (Codex pattern):** a reliable one-key copy for the common "grab the model's answer" need, kept distinct from arbitrary-selection copy through Copy Mode.

---

## Dependencies / Assumptions

- Reuses the existing SGR enable/disable helpers (`ENABLE_SGR_MOUSE_TRACKING` / `DISABLE_SGR_MOUSE_TRACKING` in `tui/src/libs/terminal/mouse.ts`) for the Copy Mode toggle — verified present; the toggle must coordinate with the `useEffect` in `HomeScreenView` that currently owns enabling tracking.
- Right-click parsing extends the existing SGR parser in `tui/src/libs/terminal/mouse.ts`, which today parses only the left button (code 0) and the wheel — verified; right-click is SGR button code 2.
- Composer insertion reuses `insertComposerTextAtom` (`tui/src/state/ui/composer/atoms.ts`), which already inserts text at the caret and recomputes the over-limit validation — verified present.
- `Ctrl+C` armed-exit is owned by `useGlobalKeys` (`tui/src/useGlobalKeys.ts`) and ignored by the composer dispatcher — verified; new handlers must not reintroduce `Ctrl+C` handling.
- Bracketed paste is not enabled today (no `?2004h` in `tui/src`) — verified; it is independent of mouse mode, so it stays enabled while Copy Mode toggles the mouse off.
- Assumes a cross-platform clipboard mechanism is reachable from the TUI runtime (Bun/Node) on Windows/macOS/Linux; Linux may require a helper (`xclip`/`xsel`/`wl-clipboard`), which is why R5/R11 require graceful failure. Unverified assumption to confirm in planning.
- Assumes the transcript state exposes the last agent response's text for `Ctrl+O` — unverified; to confirm in planning against the body/transcript atoms.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R6][User decision] Which key toggles Copy Mode (e.g. a function key such as F9, or a letter combo) — pick a free, reliably-detectable key that does not collide with existing bindings.
- [Affects R8][User decision] Whether Copy Mode exits on Esc only or on any key press (Gemini exits on any key).
- [Affects R3][Technical] Whether a right-click first moves the caret to the click position (as left-click does) before pasting, or always pastes at the current caret.
- [Affects R10][Technical] The exact definition of "last response" `Ctrl+O` copies (last assistant message vs. last completed turn) and where that text is sourced in transcript state.
- [Affects R4][Technical] Confirm across the target terminals (Windows Terminal, WezTerm) that terminal-native `Ctrl+V` paste and the app-level `Ctrl+V` read never both fire, so no double paste can occur.
- [Affects R5, R11][Needs research] Clipboard mechanism for the TUI runtime — a cross-platform library versus shelling out to OS tools — and how Linux tool availability is detected and surfaced.
