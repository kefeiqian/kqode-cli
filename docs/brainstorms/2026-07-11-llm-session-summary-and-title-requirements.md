---
date: 2026-07-11
topic: llm-session-summary-and-title
---

# LLM Session Summary for Resume Label and Terminal Title

## Summary

Replace the raw first prompt used as a session's summary with a short, LLM-generated title. After a new session's first turn completes, KQode generates the summary in the background from the first prompt and first response, then upgrades both the `/resume` label and the terminal title from an immediate truncated-prompt placeholder to that summary. If the call times out or fails, the placeholder stays.

---

## Problem Frame

KQode already sets a session's terminal title on resume and stores a per-session "summary," but that summary is just the first user prompt with whitespace collapsed. First prompts are frequently long, multi-line, or paste-heavy, so the `/resume` Summary column and the terminal tab often show a truncated wall of text instead of a recognizable label. Users scanning past sessions cannot tell them apart at a glance, and the terminal tab does not communicate what a session is about.

A related gap: today only the resume flow changes the terminal title. A brand-new session keeps the generic product title through its entire first turn, so the tab never reflects the fresh session the user is actively working in.

---

## Actors

- A1. KQode user: Starts and resumes sessions; reads the terminal tab title and the `/resume` list to recognize work.
- A2. KQode TUI: Writes the terminal window title and renders the `/resume` list.
- A3. KQode Rust backend: Runs the agent loop and provider calls; generates the summary and pushes it to the TUI.
- A4. Local session store and durable log: Persist per-session metadata (including the summary) and serve the `/resume` list.

---

## Key Flows

- F1. First-session titling
  - **Trigger:** User submits the first prompt of a new session.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** Placeholder summary derived from the truncated first prompt → terminal title + stored label seeded with it → first turn completes → backend generates the LLM summary in the background from prompt + response → backend persists it and notifies the TUI → live terminal title and stored label upgrade to the generated summary.
  - **Outcome:** The active session's tab and stored label show a short, meaningful title shortly after the first exchange, and an immediate placeholder before that.
  - **Covered by:** R1, R2, R6, R7, R9, R10, R13

- F2. Resume titling
  - **Trigger:** User opens `/resume` and selects a session.
  - **Actors:** A1, A2, A4
  - **Steps:** `/resume` list shows each session's stored summary → user selects one → terminal title is set from that session's stored summary.
  - **Outcome:** The resumed session's tab and list row reflect the generated summary (or placeholder if none was produced).
  - **Covered by:** R11, R12, R14

- F3. Degraded generation
  - **Trigger:** Summary call fails, times out, or no provider/model is configured.
  - **Actors:** A3, A4
  - **Steps:** Generation is skipped or abandoned → the first-prompt placeholder remains the stored summary → no user-facing error.
  - **Outcome:** Behavior never regresses below today's first-prompt summary.
  - **Covered by:** R8

---

## Requirements

**Summary generation**
- R1. After the first turn of a new session completes successfully, KQode generates a short natural-language summary of that session in the background, without blocking the user's next input or the assistant's response.
- R2. The summary is generated from the first user prompt together with the first assistant response.
- R3. KQode generates the summary with a model call for every new session, regardless of first-prompt length (no length gating).
- R4. The generated summary is a short, single-line, human-readable phrase suitable for a compact list label and a terminal title, concise enough to fit the existing terminal-title length cap in the common case.
- R5. The summary is produced once per session and is not automatically regenerated as the session continues.
- R6. Model output is sanitized (control/unsafe sequences removed, whitespace normalized, length bounded) before it is stored or written to the terminal title.

**Placeholder and fallback**
- R7. On first-prompt submit, KQode derives a placeholder summary from the truncated first prompt (the same text used today) and uses it as the session label and terminal title until a generated summary is available.
- R8. If the summary call fails, times out, or no provider/model is configured, the first-prompt placeholder remains the session's summary and no user-facing error is surfaced.

**Terminal title and resume label**
- R9. When a fresh session's first prompt is sent, KQode updates the terminal window title to reflect that session (seeded from the placeholder), replacing the default product title.
- R10. When the generated summary becomes available for the active session, KQode updates the live terminal title to the generated summary.
- R11. When a user resumes a session, KQode sets the terminal title from that session's stored summary (generated summary if present, otherwise the placeholder).
- R12. The `/resume` list shows each session's stored summary (generated summary if present, otherwise the placeholder) in its Summary column.

**Persistence**
- R13. The generated summary is persisted durably as part of the session's durable record so it survives a rebuild of the local session index; a rebuilt index must never silently revert a generated summary back to the first-prompt placeholder.
- R14. Once a summary is generated, it replaces the placeholder everywhere the session is shown (the `/resume` list and the terminal title on resume).

---

## Acceptance Examples

- AE1. **Covers R1, R2, R7, R9, R10.** Given a new session, when the user sends a long multi-line first prompt, then the terminal title and `/resume` label immediately show the truncated first prompt, and after the first response completes they update to a short generated summary.
- AE2. **Covers R8.** Given no provider is configured (or the call times out), when the first turn completes, then the session keeps the truncated-first-prompt label and no error is shown.
- AE3. **Covers R11, R12, R14.** Given a session whose summary was generated earlier, when the user opens `/resume` and selects it, then the list row shows the generated summary and the terminal title is set to it.
- AE4. **Covers R13.** Given a session with a generated summary, when the local session index is rebuilt from the durable record, then the session still shows the generated summary, not the first-prompt placeholder.
- AE5. **Covers R4, R6.** Given a first prompt/response containing control characters or an overlong description, when the summary is generated, then the stored and displayed title is a sanitized single-line phrase within the length cap.

---

## Success Criteria

- A user scanning `/resume` can tell sessions apart by meaning, not by a wall of first-prompt text.
- The terminal tab reflects the active session immediately (placeholder) on first prompt and a meaningful summary shortly after the first exchange.
- No first response is delayed by summary generation; failures degrade silently to today's first-prompt behavior.
- Planning inherits a clear behavioral contract: when generation runs, what it consumes, where the result is shown and persisted, and the fallback — without having to invent product behavior.

---

## Scope Boundaries

- Manual `/rename` or user-set custom titles — deferred (common companion in peer agents, but not part of this unit).
- Refreshing or regenerating the summary as the session grows or after compaction — deferred.
- A dedicated cheap/"small" model tier for the summary call — deferred; KQode uses the single active model today.
- Length-gating to skip the call for already-short first prompts — considered and rejected in favor of always generating for uniform titles.
- A status-only terminal title mode (status + folder instead of session content) — out of scope.
- Backfilling generated summaries for sessions created before this feature — out of scope; they retain their first-prompt summary.

---

## Key Decisions

- Generate after the first turn settles, from prompt + response, in the background, once: best signal without blocking, accepting that the polished title lags the first response.
- Seed from the truncated first prompt and upgrade: provides an immediate title and doubles as the failure fallback.
- Always generate for every new session: chose uniform titles over cost savings; accepts one active-model call per session.
- Use the active model with a timeout: KQode has no cheap model tier, so a slow or failed call degrades to the placeholder rather than blocking or erroring.
- Persist in the durable record: because the local index is rebuildable, the summary must live in durable truth or it silently reverts to the placeholder.
- Sanitize model output before display and terminal write: the title is attacker-influenced text emitted as a terminal escape sequence and shown in a list.

---

## Dependencies / Assumptions

- An existing background summarization/provider path (used for conversation compaction) can be followed for the session-title summary call.
- The backend can push an update to the TUI when the summary lands (the existing per-turn notification pattern), enabling the live terminal title to upgrade mid-session.
- The durable session log is the source of truth and the local index is rebuildable from it.
- Today only the resume flow sets the session terminal title; wiring the live-session title (seed on first prompt, upgrade on summary) is part of this work.
- Exit continues to reset the terminal title, so no KQode session title outlives the process.
- A single active `(provider, model)` selection exists; when none is connected, generation is skipped and the placeholder stands.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Exact model/request parameters for the summary call (temperature, token budget, one-shot vs streaming).
- [Affects R1, R8][Technical] Timeout value and whether to retry once on failure (peers use ~5s timeout; Claude Code retries once).
- [Affects R10][Technical] Shape of the backend→TUI notification that carries the generated summary for the live session.
- [Affects R4][User decision] Target length/character budget and casing for the generated title.
- [Affects R1][Technical] Behavior when the first turn cancels or errors (no response to summarize): keep the placeholder and try after the next completed turn, or wait.
- [Affects R6][Technical] Whether to reuse the existing display-text sanitizer or a title-specific one.
