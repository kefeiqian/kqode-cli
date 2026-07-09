---
date: 2026-07-09
topic: local-memory-system
---

# Local Memory System

## Summary

KQode will add a dedicated local memory system that keeps durable user, repo, folder, decision, badcase, and reference memories outside `AGENTS.md`. Memory is file-based and inspectable by default, supports explicit `/memory` management, and allows high-confidence background extraction to update active memory while recording every automatic change in an inbox for review, edit, rollback, and correction.

---

## Problem Frame

KQode is adding local session resume and full conversation history with auto-compaction, but those features only preserve or compress the current session. They do not create durable knowledge that helps future sessions understand a user's preferences, repo conventions, project decisions, recurring mistakes, or where external context lives.

Today `AGENTS.md` carries durable project instructions, but it is the wrong home for every remembered fact. Instruction files should remain authoritative guidance, while memory needs provenance, scope, review state, correction flows, and bounded recall so stale or private facts do not silently leak into unrelated work.

---

## Key Decisions

- **File truth with index support:** Memory items are stored in inspectable files. SQLite may index memory metadata, search state, inbox entries, and extraction jobs, but it is not the sole source of remembered facts.
- **Dedicated `/memory` surface:** KQode uses a user-facing `/memory` command rather than expanding `AGENTS.md`; users can inspect, edit, forget, reload, and review memory from one place.
- **Model-instruction memory intent over keyword detection:** Plain-language remember/forget requests are handled through model instructions and the future memory tool path, not hardcoded keyword matching.
- **Lifecycle scheduler over per-prompt extraction:** Automatic extraction is a background lifecycle job. It does not run inside every live prompt request and does not block the main agent turn.
- **Direct high-confidence updates with inbox audit:** Explicit manual memory writes update active memory immediately. Automatic extraction can update active memory only when high-confidence, and every automatic change creates an inbox audit item with provenance and rollback affordances.
- **Candidate fallback for ambiguity:** Low-confidence, conflicting, sensitive, or broad inferred memories become inactive candidates or no-ops rather than active memory.
- **Short-term and long-term memory stay separate:** Session transcript, compaction summary, and resume state remain session continuity features. Long-term memory is a separate durable corpus with explicit scope and source evidence.

---

## Actors

- A1. **KQode user:** Asks KQode to remember, forget, inspect, or use memory.
- A2. **Main agent:** Uses active memory as bounded context and may explicitly save memory when the user asks.
- A3. **Memory coordinator:** Owns memory scheduling, scope routing, inbox entries, and active-memory updates.
- A4. **Memory extraction worker:** Runs in the background on eligible session history and proposes or applies memory updates.
- A5. **Memory reviewer:** The user acting through `/memory inbox`, `/memory show`, or `/memory edit`.

---

## Requirements

**Memory model and scopes**

- R1. KQode stores long-term memory outside `AGENTS.md` in dedicated, inspectable memory files.
- R2. Memory supports at least these scopes: user-global, repo/project, folder/subtree, session-only, and future team/shared.
- R3. Each memory item has a type that explains how it should be used: user, feedback, project, decision, badcase, or reference.
- R4. Each memory item records provenance: when it was created, what session or command produced it, whether it was manual or automatic, and enough source context for review.
- R5. Repo/project and folder memory must not leak into unrelated repositories or folders.
- R6. User-global memory must not store repo-specific conventions unless the user explicitly chooses that scope.
- R7. Session-only memory is available for the current conversation and summaries, but is not promoted to long-term memory unless a manual command or extraction worker creates a long-term item.

**Manual memory management**

- R8. `/memory` opens the memory management surface.
- R9. `/memory show` displays active memory by scope and type, with provenance and last-updated information.
- R10. `/memory list` lists memory files and items without dumping all contents.
- R11. `/memory edit` lets the user edit a selected memory file or item.
- R12. `/memory forget` removes or disables a selected memory item and records that correction so it is not immediately recreated.
- R13. `/memory reload` refreshes active memory from the file corpus without restarting the backend.
- R14. When the user explicitly asks KQode to remember or forget something, KQode acts immediately through the memory system rather than waiting for background extraction.
- R15. KQode does not use a hardcoded remember/forget keyword detector; plain-language memory intent is routed through model instructions or a memory tool once that loop exists.

**Automatic extraction lifecycle**

- R16. Automatic extraction runs as a lifecycle background job, not as part of every prompt request.
- R17. The scheduler may trigger extraction after a session becomes idle, before clean exit, after resume discovers eligible old sessions, or when an explicit remember/forget event needs processing.
- R18. The scheduler considers only settled history; active, pending, cancelled, or still-streaming turns are not extracted.
- R19. The scheduler uses a per-session cursor so each extraction considers only new material since the last successful extraction for that session.
- R20. Trivial sessions or unchanged transcript ranges do not launch extraction.
- R21. Background extraction is coalesced: if a run is already active, later eligible work is queued or merged instead of spawning duplicate workers.
- R22. Extraction failures do not block the main agent turn; failures are visible in diagnostics and, when user-actionable, in the memory inbox.

**Automatic update behavior**

- R23. The extraction worker can produce three outcomes: no change, inactive candidate, or active memory update with an inbox audit item.
- R24. Active automatic updates require high confidence that the fact is durable, scoped correctly, non-sensitive, and not derivable from the current codebase.
- R25. Ambiguous or conflicting findings become inactive candidates that require user review before activation.
- R26. Sensitive content, secrets, credentials, and private personal data are never saved as memory.
- R27. Automatic updates must be small and topical; the worker updates an existing memory item when appropriate instead of creating duplicates.
- R28. Every automatic active update records a reversible diff or equivalent rollback data.
- R29. The worker respects explicit corrections and forget decisions when deciding whether to recreate a memory.

**Inbox, review, and correction**

- R30. `/memory inbox` shows automatic updates and candidates, grouped by active updates needing audit and inactive candidates needing approval.
- R31. Inbox entries show source, target scope, target type, confidence, created time, and the memory diff or proposed content.
- R32. The user can approve, edit, reject, undo, or mark an inbox entry as stale.
- R33. Undoing an automatic active update restores the previous memory content and records a correction so the same update is not recreated immediately.
- R34. Editing an inbox entry updates the active memory or candidate while preserving the audit trail.
- R35. Rejected candidates remain available as history but are not loaded as active memory.

**Prompt loading and recall**

- R36. KQode loads a bounded memory index or summary by default rather than dumping all memory files into every prompt.
- R37. Active memory fragments included in a turn are traceable: the model context records source path, scope, type, and timestamp.
- R38. If a recalled memory names a specific file, function, command, or flag, KQode treats it as a stale-prone claim and verifies it before making a recommendation that depends on it.
- R39. Query-time relevant-memory selection is part of the product shape, but implementation may follow after active memory files and inbox review are reliable.

**Observability and safety**

- R40. KQode can explain which memory items influenced a response.
- R41. Memory extraction and memory loading events are written to the session trace with enough detail for replay and debugging.
- R42. Memory write access is policy-gated to memory roots; extraction workers do not receive broad filesystem write access.
- R43. Headless/non-interactive runs fail closed for memory changes that require user review.

---

## Key Flows

- F1. **Explicit remember**
  - **Trigger:** The user uses `/memory add`, or the model follows memory instructions/tooling after the user clearly asks to remember something.
  - **Actors:** A1, A2, A3
  - **Steps:** KQode classifies the scope and type, writes the active memory item, records provenance, and shows where it was saved.
  - **Outcome:** The fact is active immediately and appears in `/memory show`.
  - **Covers:** R1-R15

- F2. **Lifecycle auto extraction**
  - **Trigger:** A session becomes eligible after idle, clean exit, resume scan, or explicit extraction.
  - **Actors:** A3, A4
  - **Steps:** The coordinator selects settled transcript ranges after the session cursor, starts one background worker, and the worker either no-ops, creates inactive candidates, or applies high-confidence updates.
  - **Outcome:** The main turn is unaffected; any memory changes appear in `/memory inbox`.
  - **Covers:** R16-R29

- F3. **Review automatic update**
  - **Trigger:** The user opens `/memory inbox`.
  - **Actors:** A1, A5
  - **Steps:** The user reviews source, diff, scope, type, and confidence; then approves, edits, rejects, or undoes the entry.
  - **Outcome:** Active memory and inbox state stay consistent, and corrections prevent repeated bad saves.
  - **Covers:** R30-R35

- F4. **Use memory in a future turn**
  - **Trigger:** The user asks a new question in a repo or folder with active memory.
  - **Actors:** A2, A3
  - **Steps:** KQode loads a bounded memory index, includes relevant active memory fragments, verifies stale-prone claims when needed, and records trace evidence.
  - **Outcome:** The model benefits from durable memory without receiving an unbounded memory dump.
  - **Covers:** R36-R41

---

## Acceptance Examples

- AE1. **Explicit user preference:** Given the user uses `/memory add` or the model memory tool records "from now on, don't summarize every diff at the end," when KQode saves memory, then the preference is written as user or feedback memory immediately and appears in `/memory show`.
- AE2. **Automatic project decision:** Given a long completed session establishes that JSONL remains the replay truth and SQLite is only an index, when lifecycle extraction runs, then KQode may update a decision memory and create an inbox audit entry showing the source session and diff.
- AE3. **Ambiguous inferred fact:** Given the transcript hints that the user might prefer a workflow but never clearly decides it, when extraction runs, then KQode creates an inactive candidate or no-ops rather than silently activating the memory.
- AE4. **Rollback:** Given an automatic memory update is wrong, when the user chooses undo in `/memory inbox`, then the previous memory content is restored and a correction prevents immediate recreation.
- AE5. **No per-turn extraction:** Given the user sends "thanks" after a completed task, when the turn settles, then KQode does not launch a memory worker just because a turn completed.
- AE6. **Stale memory verification:** Given memory says a helper exists in `src/foo.rs`, when a future recommendation depends on that helper, then KQode verifies the file or symbol before recommending it.

---

## Scope Boundaries

- No remote/team sync in v1; reserve scope and metadata so team memory can be added later.
- No unreviewable broad auto-memory mode in v1; automatic active writes require high confidence and remain auditable.
- No storing secrets, credentials, or sensitive personal data.
- No replacing `AGENTS.md`; memory complements instructions rather than becoming the project instruction source.
- No requirement to implement semantic/vector search in v1; bounded index and metadata search are enough for the first memory loop.
- No promotion from session summary or compaction summary to long-term memory without a memory-specific extraction or manual action.

---

## Dependencies and Assumptions

- The local session resume plan provides durable session identity and replayable transcript history: `docs/plans/2026-07-08-001-feat-local-session-resume-plan.md`.
- The conversation history and auto-compaction plan provides full ordered history and compaction state: `docs/plans/2026-07-09-001-feat-conversation-history-and-auto-compaction-plan.md`.
- The memory system should align with existing KQode direction in `docs/kqode_core_implementation_details.md` R35-R38 and `docs/kqode_build_path.md` M6.
- The initial implementation can use a simple local scheduler and file corpus before adding richer retrieval or team sync.

---

## Sources and Research

- `docs/research/2026-07-09-memory-and-context-persistence-patterns.md` compares Codex, Gemini CLI, OpenCode, Kimi Code, Aider, SWE-agent, and a local Claude Code product reference.
- `docs/plans/2026-07-08-001-feat-local-session-resume-plan.md` defines session replay and resume boundaries.
- `docs/plans/2026-07-09-001-feat-conversation-history-and-auto-compaction-plan.md` defines short-term history and compaction behavior.
- `blog/docs/01-KQode介绍.md` positions KQode as a Rust-based coding-agent harness inspired by tools including Codex, Claude Code, Gemini CLI, OpenCode, Kimi Code, and SWE-agent.

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- Exact memory file layout and naming rules.
- Exact inbox storage format and rollback representation.
- Whether v1 ships `/memory extract` as a manual scheduler trigger.
- Initial scheduler thresholds for idle time, session size, and extraction batching.
- Whether query-time relevant recall lands in the same implementation plan or a follow-up plan.
