---
date: 2026-07-03
topic: tui-slash-command-system
---

# TUI Slash-Command System with Autocomplete

## Summary

Add an extensible slash-command system to the Ink TUI: typing `/` opens a floating, filterable command menu above the composer, and selecting a command runs a client-side action. v1 ships `/exit`, `/clear`, and `/help`, matching the reference-tool (Claude Code / Copilot CLI) autocomplete experience.

---

## Problem Frame

The TUI composer treats every keystroke as prompt text — on Enter it validates and sends the text straight to the Rust backend (`tui/src/components/PromptComposer/usePromptComposerInput.ts` → `enqueuePromptAtom`). There is no way to trigger meta-actions like quitting or clearing the transcript from inside the session, and neither `/exit` nor `/clear` is actually wired up today. The status bar already advertises `/ commands | @ mention | ? help` (`tui/src/components/StatusBar.tsx`), so users are told commands exist, but the affordance is unimplemented — discoverable-looking, but dead. Users must reach for Ctrl+C to exit and have no way to reset a cluttered transcript at all.

---

## Key Flows

- F1. Invoke a command via autocomplete
  - **Trigger:** User types `/` at the start of the composer.
  - **Actor:** TUI user.
  - **Steps:** Menu opens above the composer listing all commands with descriptions → user types to filter and/or uses ↑/↓ to move the highlight → user presses Tab to complete the highlighted command into the composer for editing, or Enter to run it → on Enter, the command action runs, the menu closes, and the composer clears.
  - **Outcome:** The chosen command's client-side action runs (or the command text is completed into the composer for further editing).
  - **Covered by:** R3, R4, R5, R7, R8, R9

- F2. Fallthrough for non-commands and typos
  - **Trigger:** User submits composer text on Enter with the menu not driving the submit.
  - **Actor:** TUI user.
  - **Steps:** If the text does not start with `/`, it is sent to the backend as today → if it starts with `/` but matches no command, an inline "unknown command" hint is shown and nothing is sent.
  - **Outcome:** Normal prompts reach the backend unchanged; mistyped commands are caught client-side.
  - **Covered by:** R11, R12

---

## Requirements

**Command registry**
- R1. Commands are defined declaratively in an extensible registry, each with a name and a short description; adding a new command is a single registry entry with no changes to composer-input plumbing or menu rendering.
- R2. The v1 registry contains exactly `/exit`, `/clear`, and `/help`.

**Autocomplete menu**
- R3. When the composer content starts with `/`, a command menu appears above the composer showing each matching command's name and description.
- R4. As the user types after `/`, the list filters to commands matching the typed text, and one item is always highlighted.
- R5. ↑/↓ move the highlight; Tab completes the highlighted command into the composer without executing it; Enter executes the highlighted command; Esc dismisses the menu.
- R6. The menu closes automatically once the composer no longer starts with `/`.

**Command execution**
- R7. `/exit` quits KQode, running the same teardown and exit-summary card as Ctrl+C.
- R8. `/clear` clears all transcript/body content and resets the in-memory prompt history and scroll position.
- R9. `/help` lists the available commands and their descriptions in the transcript body.
- R10. Commands execute client-side in the TUI and are never sent to the backend.

**Unknown / fallback handling**
- R11. Submitting a `/`-prefixed string that matches no command shows an inline "unknown command" hint and is not sent to the backend.
- R12. Submitting text that does not start with `/` behaves exactly as today — sent to the backend as a prompt.

---

## Acceptance Examples

- AE1. **Covers R3, R4.** Given an empty composer, when the user types `/`, then a menu appears above the composer listing `/exit`, `/clear`, and `/help` with descriptions; typing `cl` narrows the list to `/clear`.
- AE2. **Covers R5, R8.** Given the menu shows `/clear` highlighted, when the user presses Enter, then the transcript is cleared, scroll resets, and the menu closes.
- AE3. **Covers R5.** Given the menu shows `/clear` highlighted, when the user presses Tab, then `/clear` fills the composer and is not executed.
- AE4. **Covers R7.** Given the menu shows `/exit` highlighted, when the user presses Enter, then KQode tears down and prints the exit-summary card, identically to Ctrl+C.
- AE5. **Covers R11.** Given the composer contains `/foo`, when the user presses Enter, then an inline "unknown command" hint appears and nothing is sent to the backend.

---

## Success Criteria

- A user can discover and run `/exit`, `/clear`, and `/help` by typing `/` — without memorizing them — matching the reference-tool experience.
- Adding a new command later requires only a new registry entry, with no changes to input handling or menu rendering.
- The command menu integrates with the bottom-stuck layout without breaking cursor placement or scrollback (per `tui/AGENTS.md`).

---

## Scope Boundaries

- No `@` mention or `?` help affordances (separate features, even though the status bar advertises them).
- No command arguments in v1 (the `/clear [prompt]`-style hint in the reference screenshot); v1 commands are argument-free.
- No backend-routed commands or backend session-reset RPC — the backend is a stateless ACK today with no session/history.
- No escape hatch to send literal `/`-leading text to the backend in v1 (accepted tradeoff of matching the reference UX).
- No fuzzy ranking beyond simple prefix/substring matching (can refine later).
- The Ctrl+C exit path is unchanged.

---

## Key Decisions

- **Enter executes the highlighted command; Tab completes it into the composer:** matches the reference tools (Claude Code / Copilot CLI) the user is emulating.
- **Unknown `/command` → inline hint, not sent to backend:** catches typos and prevents accidental prompts.
- **Extensible registry over hardcoding:** the "system" framing plus a status bar that already advertises more commands make a registry near-zero extra cost.
- **`/help` renders into the transcript body (not a modal):** reuses the existing body-entry rendering.
- **`/exit` reuses `finishSession`:** a single exit path so behavior can't drift from Ctrl+C.

---

## Dependencies / Assumptions

- Commands are only reachable while the composer is active. During backend draining, `inputLockedAtom` (`tui/src/state/global/inputLock.ts`) disables input, so there is no mid-flight `/clear` race.
- The backend (`tui/src/backend/client/backendClient.ts`) is a stateless ACK today; `/clear` resets only TUI-side state (`promptQueueAtom` in `tui/src/state/backend/atoms.ts`) — there is no backend history to clear.
- The menu must respect the bottom-stuck layout, `FULLSCREEN_GUARD_ROWS`, and the manual cursor math described in `tui/AGENTS.md` and `tui/src/state/global/dimensions.ts`.
- Command interception hooks into the existing submit/validation path in `tui/src/components/PromptComposer/usePromptComposerInput.ts`.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Exact menu placement, height, and how it coexists with the body/composer layout and cursor math (`tui/AGENTS.md` constraints).
- [Affects R4][Technical] Filtering algorithm (prefix vs substring vs fuzzy) and how the highlight resets as the query changes.
- [Affects R5][Technical] How Enter is disambiguated between "execute highlighted command" (menu open) and "submit prompt" (menu closed) within the existing input hook.
