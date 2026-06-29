---
date: 2026-06-25
topic: first-ink-tui-homepage
---

# First Ink TUI Homepage

## Summary

Build the first KQode Ink TUI as a static Copilot CLI-style home screen with a working prompt submission seam to the Rust backend. The first interaction is deliberately small: type a multiline prompt, press Enter, and see the Rust backend echo that text.

---

## Problem Frame

KQode is currently at the project-foundation stage: the Rust binary exists, but the planned TypeScript Ink TUI has not been created yet. The product direction already calls for a replaceable TypeScript surface over a Rust core, so the first TUI slice should prove the visual shell and the frontend/backend boundary without pulling in later agent-loop, session, command, or model features.

The immediate need is a credible terminal home screen that establishes KQode's visual identity, mirrors the familiar coding-agent CLI layout, and gives future work a stable place to attach real agent behavior.

```text
KQode logo   KQode vX.Y.Z uses AI.
             Check for mistakes.

Tip content / empty output area

~\Projects\KQode
| multiline prompt composer, wrapping as text grows
/ commands · @ mention · ? help · tab next tab              GPT-5.5
```

---

## Actors

- A1. User: Starts the TUI, types a prompt, and submits it with Enter.
- A2. Ink TUI: Presents the terminal interface, captures input, and displays backend output.
- A3. Rust backend: Receives submitted text and echoes it back for the first integration proof.

---

## Key Flows

- F1. First screen render
  - **Trigger:** The user starts the TUI.
  - **Actors:** A1, A2
  - **Steps:** The TUI renders the top identity area, large empty body area, current working directory line, prompt composer, and bottom status bar.
  - **Outcome:** The user sees a stable KQode home screen before any prompt is submitted.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. Prompt submit and echo
  - **Trigger:** The user types text into the prompt composer and presses Enter.
  - **Actors:** A1, A2, A3
  - **Steps:** The TUI captures the current prompt, sends it to the Rust backend, receives the echoed output, and displays it in the body area.
  - **Outcome:** The frontend/backend seam is proven without invoking any model or agent loop.
  - **Covered by:** R6, R7, R8

---

## Requirements

**Home screen layout**
- R1. The TUI must render a top identity area containing a simple KQode logo, the product name `KQode`, and the current application version.
- R2. The main body area must leave room for future tips, assistant output, tool output, and status messages, while remaining static for this first slice.
- R3. The TUI must display the current working directory directly above the input composer.
- R4. The input composer must sit above the bottom status bar and visually read as the active prompt area.
- R5. The bottom status bar must show `/ commands`, `@ mention`, `? help`, `tab next tab`, and the default model label `GPT-5.5` aligned toward the right.

**Input behavior**
- R6. The input composer must accept typed text.
- R7. The input composer must support multiline display with wrapping when the text exceeds the available width.
- R8. Pressing Enter must submit the current composer text to the backend for this first slice.

**Backend proof**
- R9. The Rust backend must receive submitted text from the TUI and output the same text.
- R10. The TUI must display the backend output in the visible body area so the user can confirm the submit action happened.
- R11. This first slice must not call a model provider, run an agent loop, or execute tools.

**Structure and visual style**
- R12. The Ink TUI must be organized as components rather than one monolithic render function.
- R13. The TUI source must live under `tui/`.
- R14. The initial palette must use centralized coding-agent CLI theme tokens; the active direction is GitHub/Gemini-inspired foreground colors with background rendering kept internal and fallback-aware.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4, R5, R14.** Given the TUI is started from the KQode repository, when the first screen renders, the user sees the KQode identity area, the current working directory above the composer, the bottom command hints, and `GPT-5.5` on the right using the centralized GitHub/Gemini-inspired theme direction.
- AE2. **Covers R6, R7.** Given the prompt composer is focused, when the user types a prompt longer than the terminal width, the composer wraps the text onto multiple visible lines without losing the typed content.
- AE3. **Covers R8, R9, R10, R11.** Given the user has typed `hello from tui`, when they press Enter, the Rust backend receives that text, echoes `hello from tui`, and the TUI displays the echoed output without making any model or tool call.

---

## Success Criteria

- The first TUI screen feels like a recognizable KQode coding-agent home screen rather than a raw demo scaffold.
- A downstream implementer can validate the Rust/Ink boundary by submitting text and seeing the echoed backend output.
- The slice stays small enough that later planning can replace the echo behavior with real protocol events without undoing the visual component structure.

---

## Scope Boundaries

- Real slash command execution, `@` file mentions, `?help`, and Tab navigation are visual affordances only in this slice.
- Model selection, model list management, provider calls, and streaming assistant responses are deferred.
- Session accounting, cost display, approval panels, diff panels, trace logging, and persistent session history are deferred.
- A full daemon or mature JSON-RPC/JSONL session protocol is deferred; this slice only needs the smallest backend boundary that proves text submission.
- Full theme configuration is deferred; centralized GitHub/Gemini-inspired theme tokens are internal to the first screen.

---

## Key Decisions

- Static shell first: This proves the TUI/backend seam without pulling later agent behavior into the foundation milestone.
- One-shot Enter submit first: This validates the composer and backend delivery before adding prompt history, advanced editing, slash command execution, or model controls.
- Product-feeling palette now: The first screen should look intentional, while project/user theme infrastructure remains future work.

---

## Dependencies / Assumptions

- The repository currently has a single Rust package and no checked-in TypeScript TUI package.
- The default visible model label is `GPT-5.5` until model selection is designed later.
- The displayed version should come from project/package metadata where practical, with exact source resolved during planning.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R8, R9][Technical] Decide the smallest reliable process/protocol boundary for Ink-to-Rust text submission in this first slice.
- [Affects R12, R13][Technical] Decide the TypeScript package tooling and scripts for running the Ink TUI from `tui/`.
