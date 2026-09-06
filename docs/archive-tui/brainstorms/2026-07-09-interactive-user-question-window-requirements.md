---
date: 2026-07-09
topic: interactive-user-question-window
---

# Interactive User-Question Window

## Summary

Add a KQode capability to ask the user a question mid-conversation through a dedicated TUI "Question" window — a titled box with numbered choices, an "Other (type your answer)" freeform fallback, and keyboard navigation (↑/↓ to select, enter to confirm, esc to cancel) — and fold the question plus the user's answer back into the running conversation as normal turns.

---

## Problem Frame

KQode's conversation is structurally one-directional: the user submits, the model answers. There is no first-class way for KQode to pause and ask the user a clarifying question with concrete options — the "which of these did you mean?" or "confirm before I continue?" interaction that other terminal agents (e.g. GitHub Copilot CLI's Question prompt) use to reduce wrong turns.

Without it, ambiguity forces the model to guess or forces the user to pre-empt with long, over-specified prompts. And any answer the user does give is captured only as loose prose, not as structured conversation state the model can rely on afterward.

---

## Actors

- A1. User: Reads the question, selects a choice or types a freeform answer, or cancels.
- A2. KQode backend: Emits the question (text + choices + whether freeform is allowed) and receives the answer.
- A3. KQode TUI: Renders the Question window, owns selection / entry / cancel input, and returns the outcome.

---

## Key Flows

- F1. Ask-and-answer
  - **Trigger:** KQode needs a decision from the user mid-conversation.
  - **Actors:** A1, A2, A3
  - **Steps:** The backend issues a question request (prompt text, ordered choices, allow-freeform flag). The TUI opens the Question window and locks normal input. The user navigates with ↑/↓ and either selects a choice, chooses "Other" and types an answer, or presses esc. The TUI returns the outcome. The backend records the question and the answer as conversation turns.
  - **Outcome:** The conversation contains the question and the resolved answer; normal input resumes.
  - **Covered by:** R1, R2, R3, R4, R5, R6

---

## Requirements

**Question window (TUI)**
- R1. A dedicated Question window renders a title, the question text, and an ordered numbered list of choices, visually distinct from the normal composer.
- R2. The window supports ↑/↓ (and number keys) to move the selection, enter to confirm, and esc to cancel, with an always-present "Other (type your answer)" option that switches to freeform text entry.
- R3. While the Question window is open, the normal prompt composer is locked / suppressed so input is unambiguous, consistent with how other blocking TUI surfaces behave.

**Question protocol (backend ↔ TUI)**
- R4. The backend can issue a question carrying the prompt text, an ordered list of choices, and a flag for whether freeform input is allowed; the TUI returns either a selected choice, a freeform string, or a cancellation.
- R5. Cancellation (esc) is a distinct, first-class outcome the backend can handle deliberately (e.g. treat as "no answer"), not an error.

**Conversation integration**
- R6. The presented question and the user's answer (or cancellation) are recorded as conversation turns, so they are carried in history, persisted, and eligible for compaction like any other round.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given the backend asks "Which database?" with three choices, when the window is open, the user sees a numbered list plus an "Other (type your answer)" entry and can move the highlight with ↑/↓.
- AE2. **Covers R2.** Given the Question window is open, when the user selects "Other" and types a value, that typed value is returned as the answer.
- AE3. **Covers R5.** Given the Question window is open, when the user presses esc, the backend receives a cancellation outcome rather than an error or an empty selection.
- AE4. **Covers R6.** Given a question is answered, when the next model turn is assembled, the question and the answer appear in the conversation history sent to the model.

---

## Success Criteria

- KQode can ask a concrete, option-based question and get a clean selected-or-typed answer without the user free-typing everything.
- Answers become part of the conversation the model sees, so a follow-up turn "knows" what the user chose.
- The interaction is unambiguous — the user always knows whether they are answering a question or composing a new prompt.

---

## Scope Boundaries

- Covers the question window, its protocol, and history integration — not a general tool-calling framework.
- Not a full approvals / permission-gate UI (risky-command confirmation, diff approval); those are separate surfaces even if they might reuse this window later.
- One outstanding question at a time is assumed; queuing or stacking multiple simultaneous questions is out of scope.

---

## Key Decisions

- Model the interaction on the Copilot CLI "Question" prompt (titled box, numbered choices, "Other" freeform, ↑/↓/enter/esc) per the user's reference screenshot.
- Question and answer are conversation turns, not out-of-band UI state, so they couple naturally to the conversation-history + compaction feature.

---

## Dependencies / Assumptions

- Builds on the conversation-history feature (companion brainstorm `2026-07-09-conversation-history-and-auto-compaction-requirements.md`): answers are only useful to the model because history is now carried per session.
- The TUI already has a selectable-menu interaction model (the slash-command menu) and masked-input flows (`/login`) whose patterns this window can follow.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R4][User decision] How is a question triggered? KQode has no tool-calling today, and tool-calls were previously scoped out. Options: (a) the model emits a structured text marker the backend parses into a question (a minimal text-fallback mechanism); (b) the window is driven only by KQode's own non-model flows (slash commands, confirmations) for now, deferring model-driven questions until tool-calling exists; or (c) introduce a single-purpose "ask user" tool now. This choice decides whether the feature ships standalone or waits on tool-calling. Recommended starting point: (a) or (b), to keep this independent of a full tool-calling framework.

### Deferred to Planning

- [Affects R6][Technical] Exactly how a question / answer pair is represented as turns so it round-trips through persistence, resume, and compaction.
- [Affects R3][Technical] Precise input-locking and layout of the window relative to the composer, cwd row, and status bar (Ink cursor placement is sensitive to vertical layout changes).
