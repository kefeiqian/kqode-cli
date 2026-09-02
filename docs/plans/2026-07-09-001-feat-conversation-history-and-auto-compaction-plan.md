---
title: "feat: Full conversation history and auto-compaction"
type: feat
status: completed
date: 2026-07-09
origin: docs/brainstorms/2026-07-09-conversation-history-and-auto-compaction-requirements.md
deepened: 2026-07-09
---

# feat: Full conversation history and auto-compaction

## Summary

Assemble every model request from the full per-session conversation — a metadata-enriched system prompt, all prior completed rounds, then the new message — replacing today's single-prompt request in `src/chat/turn.rs`. When the assembled request nears the model's context window, the coordinator runs a hidden summarization call that compacts the oldest rounds into a structured summary while keeping recent rounds verbatim, surfacing an "Auto compacting…" status. The compaction summary is persisted as a JSONL log event (JSONL stays the source of truth; SQLite stays the fast listing index), and resume replays the one session file to restore full history for display plus the summary for prompt assembly.

---

## Problem Frame

Each submit is sent to the provider in isolation: `stream_turn` builds `[system_message, user(prompt)]`, so the model has no memory of earlier rounds and multi-turn work is impossible (see origin: `docs/brainstorms/2026-07-09-conversation-history-and-auto-compaction-requirements.md`). The in-memory `Transcript` already holds every round's prompt and assistant result — the gap is purely at request assembly. Naively sending the whole history would eventually exceed the model's window and hard-fail exactly on long, valuable sessions, which is why compaction is part of the same feature.

---

**Conversation history assembly**
- R1. Every request includes the full ordered conversation: system prompt, all prior completed rounds (user + assistant), then the new user message.
- R2. Only completed rounds contribute history; cancelled/errored/needs-configuration rounds are excluded from the request.
- R3. The visible transcript and the on-disk log always retain full, unmodified history regardless of what the request payload contains.

**Session and workspace metadata**
- R4. The system prompt carries a metadata block: current date/time, workspace path, git branch, short git status (plus existing OS + model).
- R5. Metadata is live per turn; a session id is not included in the prompt.
- R6. A non-git workspace degrades gracefully (omit branch/status, no error).

**Auto-compaction**
- R7. Before sending, estimate assembled tokens against a per-model budget and trigger compaction at ~70–75% of it.
- R8. Compaction summarizes the oldest rounds and keeps the most recent verbatim: system + summary + verbatim tail + new message.
- R9. The summary is produced by a hidden call using the active model and is structured (goal / key decisions / recent context / open threads / relevant files).
- R10. Repeated compactions feed the previous summary back in (anchored), refining rather than regenerating.
- R11. If the summarization call fails, the turn fails with a clear error and nothing is sent; history is not silently truncated.
- R16. After building the compacted request, re-estimate tokens; if it still exceeds the budget (e.g. an oversized new prompt, an oversized verbatim tail, or a grown summary), the turn fails with a distinct "input too large for this model's context" error rather than dispatching a call that would hard-fail on context length.

**Status and feedback**
- R12. While summarization runs, the status bar shows "Auto compacting…", distinct from "Working", returning to "Working" for the main call.
- R13. Cancelling (Esc) during compaction cancels the whole turn as a clean `cancelled` settle (not an error), and clears the "Auto compacting…" status.

**Persistence and resume**
- R14. On compaction, the summary + covered-round boundary are persisted to the JSONL session log.
- R15. Resume restores the full transcript (display) and the latest compaction state (assembly) without re-summarizing already-compacted history.

**Origin actors:** A1 (User), A2 (Conversation coordinator), A3 (Summarization agent, hidden)
**Origin acceptance examples:** AE1 (R1), AE2 (R2), AE3 (R3, R8), AE4 (R7, R12), AE5 (R11), AE6 (R15), AE7 (R6)

*(R16 is a plan-derived requirement added during review: it closes the "compacted but still over budget" gap that R11 — which only covers the summarization call failing — does not.)*

---

## Scope Boundaries

- No tool calling / function calling and no other agent mechanics — history + compaction only.
- No manual `/compact` command — automatic only.
- No exact provider-usage token accounting — token counts are estimated (chars/token heuristic).
- No per-model context-window auto-detection: this feature uses a configured budget constant (Kimi 256k); reading it from `/models` is deferred (see below).
- No cheaper/dedicated summarizer model and no second "verify" pass.
- No prompt-caching optimization; multi-provider is out (Kimi only).
- No SQLite schema change: history and summaries are JSONL truth; SQLite stays the listing index.

### Deferred to Follow-Up Work

- Reading the model context window from the `/models` catalog at turn time: needs login→turn-time persistence plumbing (`/models` is only fetched at login today); this feature uses a configured 256k constant instead.
- Removing SQLite project-wide (provider config → config file, session list → file scan): its own brainstorm/plan; explicitly out of this feature (the discussion confirmed SQLite's SQL-query listing is worth keeping).
- Interactive user-question window: separate brainstorm `docs/brainstorms/2026-07-09-interactive-user-question-window-requirements.md`.

---

## Context & Research

### Relevant Code and Patterns

- Request assembly today: `src/chat/turn.rs` (`stream_turn` builds `[system_message, user]`), `src/chat/system_prompt.rs` (`system_message`), `src/chat/types.rs` (`TurnStreamEvent`).
- Coordinator / transcript: `src/conversation/state.rs` (`LoopState`, `start_active`, `active_prompt`), `src/conversation/transcript.rs` (`Transcript`, `TranscriptTurn` with `prompt` + `result.text`), `src/conversation/mod.rs` (`Command`, `TurnJob`, `default_runner`), `src/conversation/coordinator.rs`.
- Provider layer: `src/provider/mod.rs` (`ChatMessage`, `Role`, `ProviderRequest`), `src/provider/models.rs` (`ModelInfo`, `parse_models_response`), `src/provider/kimi.rs` (streaming).
- Persistence / resume: `src/conversation/session_log.rs` (`SessionLogEvent`, `append_event`), `src/conversation/persistence.rs` (`SessionPersistence::on_enqueue/on_settle`), `src/backend/sessions.rs` (`resume_session`, `restore_turns`), `src/store/sessions.rs` (`parse_session_log`, `list_resumable_sessions`, `SessionLogEventWire`).
- Protocol: `src/protocol/mod.rs` (`RpcMethod`, constants), `src/protocol/queue.rs` (`TURN_*` notifications, `EnqueuedParams`), `src/protocol/sessions.rs` (resume wire types).
- Git: `src/git.rs` / `src/backend/git_status.rs` (formatted git label used by `kqode.git.status`).
- TUI status: `tui/src/components/StatusBar.tsx`, `tui/src/state/ui/statusHint.ts` (`WORKING_STATUS_HINT`, `loadingFrameAtom`), `tui/src/state/promptQueue/store.ts` (`turnInFlightAtom`).
- TUI seam / protocol mirror: `tui/src/backend/runtime/backendRuntime.ts` (`onTranscriptEvent`), `tui/src/contracts/backend/messages.ts` + `tui/src/backend/protocol/messageProtocol.ts` (mirrored constants), `tui/src/contracts/backend/client.ts`, `tui/src/__tests__/backendIsolation.test.ts` (seam guardrail).

### Institutional Learnings

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`: all backend wiring flows through the narrow `BackendClient` seam; add compaction status as a transcript-event/notification extension, not a parallel channel, so `backendIsolation.test.ts` stays green.
- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`: render new status text via `safeChromeColumnsAtom` (last-column clip hazard); if "Auto compacting…" animates dots, keep the composer caret in lockstep with `loadingFrameAtom`.
- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`: TUI `state/` is atoms-only; any TUI-side helpers go in `libs/`. (Here the compaction/token math is backend Rust, so this mainly governs the new status atom placement.)

### External References

- Reference-agent persistence (from this session's research): Codex CLI, Claude Code, Gemini CLI store history in JSONL rollout files (Codex embeds compaction as a `CompactedItem` in the rollout); OpenCode is the only SQLite-primary one. Convergent compaction pattern: hidden same-model summarization call, keep-recent-verbatim + summarize-old, structured summary, resume-from-compacted with original history retained.
- Kimi/Moonshot `/models` exposes a `context_window` field (model ids also encode `-8k/-32k/-128k`); standard OpenAI `/models` does not. (Reading it at turn time is deferred — see Deferred to Follow-Up Work; this feature uses a configured constant.)

---

## Key Technical Decisions

- **JSONL is the source of truth for history AND the compaction summary** (new `Compacted` log event); SQLite stays the rebuildable listing index; resume replays the one session file. Preserves crash-safe append + rebuild-from-log recovery, keeps fast SQL listing, avoids duplication, matches Codex. (locked this session)
- **Configured per-model context budget** (Kimi = 256,000 tokens, matching the prior streaming-chat plan `2026-06-30-001`). `context_budget` returns `window − reserved output`, and compaction triggers at ~70–75% of that returned value — one place owns the subtraction, so no downstream unit re-derives it. Reading `context_window` from the `/models` catalog is deferred: `/models` is fetched only at login and would need login→turn-time persistence plumbing to be reachable (see Deferred to Follow-Up Work).
- **Summarize-old + keep-recent-verbatim, structured + anchored summary, same active model**, hidden call reusing the streaming accumulation path. (origin + research convergence)
- **Fail the turn on compaction error** — no silent truncation. (origin)
- **Worker-internal compaction (single-phase)**: one turn worker runs the whole sequence — assemble → estimate → (summarize if over budget) → re-assemble → re-estimate → main streaming call — under **one** `CancellationToken` for its entire lifetime, and reports the compaction result (`summary` + `covered_through_seq`) back to the coordinator on the terminal/settle path. `LoopState` stays the single writer of `CompactionState` + persistence (it applies the reported result when it settles the turn). Chosen over a two-phase coordinator-respawn design because that would force re-implementing `settle()`'s `cancelling` gate in new `CompactionSettled/Failed` handlers, a second `active_thread` handoff, and a fresh cancel token mid-turn (see Alternatives Considered).
- **One assembly function** (`request.rs`) is the single source of the message list, taking `(transcript, CompactionState, new prompt, metadata)`. When a summary + `covered_through_seq` exists it always builds `system + metadata + summary + verbatim tail(seq > covered_through_seq) + new prompt`; otherwise the full history. The token estimate, the live send, and resume all call it, so they cannot diverge (fixes the resume-from-compacted correctness gap).
- **Post-compaction budget re-check**: after building the compacted request the worker re-estimates; if it still exceeds budget (oversized new prompt/tail or a grown summary), the turn fails with a distinct "input too large for this model's context" error (R16) instead of dispatching a doomed call.
- **Metadata is built off the coordinator thread.** The git-status subprocess (`git::status_label()`, blocking up to 2s) must not run on the single-writer coordinator loop or it stalls `Cancel`/`QueryStatus`; metadata is computed worker-side (or precomputed) and passed into assembly, matching the existing `spawn_git_status` offloading.
- **Compaction status rides the existing transcript-event seam** (not a new channel), modeled on `WORKING_STATUS_HINT`.
- **Token estimation is a chars/token heuristic**; provider-usage capture is deferred.

---

## Open Questions

### Resolved During Planning

- Persistence model: JSONL truth (history + `Compacted` event) + SQLite listing index; resume replays the file. (locked)
- Budget source: a configured per-model constant (Kimi 256k); `/models`-read deferred (needs plumbing). (review-revised)
- Orchestration: worker-internal single-phase compaction under one cancel token (not two-phase coordinator respawn). (review-revised)
- Assembly: one `request.rs` path consuming `CompactionState`, shared by estimate/live/resume. (review-revised)
- Overflow: post-compaction re-check → distinct "input too large" error (R16). (review-added)
- Summary shape: structured sections, anchored on prior summary. (locked)
- SQLite: no schema migration for this feature. (locked)

### Deferred to Implementation

- Exact chars-per-token divisor, threshold percentage, and reserved-output headroom numbers (tune against real Kimi responses).
- Verbatim-tail sizing: token-budgeted (~25–30% of budget) vs a fixed number of recent rounds — start token-budgeted, confirm during implementation.
- Role/placement of the injected summary message (system vs a user "conversation summary" message) — decided once in `request.rs`, exact choice at implementation.
- Exact summarization prompt wording and section set.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant TUI
    participant Coord as Coordinator (LoopState, single writer)
    participant Worker as Turn worker (one tokio thread, one CancellationToken)
    participant Prov as Provider (Kimi)

    TUI->>Coord: submit(turn)
    Coord->>Worker: run turn (transcript snapshot + CompactionState + budget)
    Worker->>Worker: assemble(system+metadata + summary? + verbatim tail + new prompt)
    Worker->>Worker: estimate vs budget×threshold
    opt over budget
        Worker-->>TUI: compaction started ("Auto compacting…")
        Worker->>Prov: hidden summarization call (head + prior summary)
        alt summary ok
            Prov-->>Worker: structured summary
            Worker->>Worker: re-assemble with summary + verbatim tail; re-estimate
            Worker-->>TUI: compaction finished ("Working")
        else summary error
            Worker-->>Coord: settle(error) — nothing sent (R11)
        end
    end
    alt still over budget after compaction
        Worker-->>Coord: settle(error "input too large") — nothing sent (R16)
    else within budget
        Worker->>Prov: main streaming call
        Prov-->>TUI: token deltas
        Worker-->>Coord: settle(completed) + compaction result if any
    end
    Note over Worker,Coord: Esc cancels the one token anytime →<br/>settle()'s cancelling gate forces a clean cancelled (R13)
    Coord->>Coord: on settle: apply CompactionState + append Compacted event (JSONL)
```

Everything from assemble → estimate → summarize → re-estimate → main call runs inside **one** worker under **one** cancel token, so cancel/failure funnel through the existing `settle()` gate. Compaction is a pre-step within the same turn: the visible transcript is only ever read for assembly, never mutated (R3); the summary shapes the request payload only.

---

## Implementation Units

### U1. Carry full conversation history into the request

**Goal:** Assemble system + all prior completed rounds + the new prompt into the request, replacing the single-prompt payload. Multi-turn memory works (pre-compaction).

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Create: `src/chat/request.rs` (the single pure assembly path: `(&[TranscriptTurn], &CompactionState, metadata, new prompt) → Vec<ChatMessage>`)
- Modify: `src/chat/turn.rs` (`stream_turn`/`run_streaming_turn` stream an assembled `Vec<ChatMessage>` instead of building `[system, user]`), `src/chat/mod.rs`, `src/conversation/mod.rs` (`TurnJob` carries the transcript snapshot + `CompactionState` + metadata the worker assembles from; `default_runner`), `src/conversation/state.rs` (`start_active` passes that snapshot/state into the job)
- Test: `src/chat/request.rs` (inline tests), `src/conversation/tests.rs`

**Approach:**
- `request.rs` is the one assembly path shared by the token estimate, the live send, and resume, so they cannot diverge. It iterates settled rounds in `seq` order, emitting `user(prompt)` + `assistant(result.text)` for completed rounds only (skip cancelled/errored/needs-configuration per R2), then the new prompt. When `CompactionState` holds a summary it emits `system + metadata + summary + verbatim tail (seq > covered_through_seq) + new prompt`; with no summary, the full history.
- Thread `CompactionState` through now even though it is always empty in this unit (compaction lands in U4–U6), so later units add no new assembly call sites.
- Assembly is a pure function of its inputs and runs worker-side (the coordinator passes a transcript snapshot + `CompactionState` + metadata into the job); it never mutates the transcript (R3). Replace `TurnJob.prompt: String` accordingly; `stream_turn` streams the assembled messages verbatim.

**Patterns to follow:** `ProviderRequest`/`ChatMessage`/`Role` in `src/provider/mod.rs`; existing `default_runner` wiring in `src/conversation/mod.rs`.

**Test scenarios:**
- Covers AE1. Happy path: three completed rounds → `system + 3×(user,assistant) + new user`, in `seq` order.
- Edge case: no prior rounds → `system + new user` only.
- Covers AE2. Edge case: a cancelled or errored round is excluded from the assembled messages.
- Edge case: assembling does not mutate the transcript (turns unchanged afterward).
- Edge case: an empty `CompactionState` yields the full history (no summary message); a populated one yields `summary + verbatim tail (seq > covered_through_seq)`.

**Verification:** A second turn's request contains the first turn's text; deterministic tests pass with a fake runner/provider.

---

### U2. Session/workspace metadata in the system prompt

**Goal:** Enrich the system message with date/time, workspace path, git branch, and short git status, alongside existing OS + model.

**Requirements:** R4, R5, R6

**Dependencies:** U1

**Files:**
- Modify: `src/chat/system_prompt.rs` (metadata block), reuse `src/git.rs` / `src/backend/git_status.rs` for the git label
- Test: `src/chat/system_prompt/tests.rs`

**Approach:**
- Extend `system_message` to append a metadata block: current date/time, workspace cwd, git branch + short status (reuse the existing formatted git label). Compute live per turn.
- Non-git workspace omits branch/status lines without error (R6). Never include a session id (R5).

**Patterns to follow:** existing `system_prompt.rs`; `GitStatusResult` label formatting (e.g. `⎇ main*`) in the git module.

**Test scenarios:**
- Happy path: the metadata block contains date/time, workspace path, branch, and status.
- Covers AE7. Edge case: non-git workspace → block omits git lines, no error.
- Edge case: a session id never appears in the assembled system message.

**Verification:** Assembled system message includes the metadata block; the non-git path does not error.

---

### U3. Configured per-model context budget

**Goal:** Provide the per-model context budget plus the threshold/reserved-output resolver used to decide compaction.

**Requirements:** R7 (budget source)

**Dependencies:** None

**Files:**
- Create: `src/chat/context_budget.rs` (configured per-model window constant — Kimi `256_000` — returning `window − reserved output`; named threshold and reserved-output constants)
- Test: `src/chat/context_budget.rs` (inline)

**Approach:**
- `context_budget(model)` returns `window − reserved output`, where `window` is a configured per-model constant (Kimi = `256_000`, matching plan `2026-06-30-001`) and unknown models fall back to that same constant. Threshold (~0.72) and reserved-output tokens are named constants (no bare literals, per AGENTS.md). The subtraction lives here only, so U4 never re-derives it.
- Reading `context_window` from `/models` is out of this unit — the catalog is fetched only at login and would need persistence plumbing to reach turn time (see Deferred to Follow-Up Work).

**Patterns to follow:** the constants/enums convention in AGENTS.md; the `KimiConfig`/`ActiveSelection` model-id threading in `src/backend/resolve.rs`.

**Test scenarios:**
- Happy path: `context_budget` for the Kimi model returns `256_000 − reserved output` (positive, below the raw window).
- Edge case: an unknown model id returns the same configured fallback budget.
- Edge case: the threshold applied to the returned budget yields the expected compaction trigger point.

**Verification:** Budget resolves to a positive value already net of reserved output for known and unknown models.

---

### U4. Token estimation + compaction trigger and split

**Goal:** Estimate assembled-request tokens and decide whether/where to compact (verbatim tail vs summarize head). Pure logic, no network.

**Requirements:** R7, R8

**Dependencies:** U1, U3

**Files:**
- Create: `src/chat/token_estimate.rs` (chars/token heuristic over `&[ChatMessage]`), `src/chat/compaction_plan.rs` (trigger + boundary-advance decision over `(transcript, CompactionState, budget)`)
- Test: inline tests in both

**Approach:**
- `estimate_tokens(&[ChatMessage])` via a named chars-per-token divisor, run over the messages `request.rs` (U1) assembles — which already fold in any existing summary + tail.
- The boundary uses one quantity, `covered_through_seq`: the summary covers `seq ≤ covered_through_seq`; the verbatim tail is `seq > covered_through_seq`. Compaction is needed when the estimate ≥ `budget × threshold` (budget from U3 already nets out reserved output). When triggered, advance `covered_through_seq` forward so the head to summarize is only the *newly-uncovered* rounds (already-covered rounds are not re-summarized — R15), while keeping a verbatim tail that fits ~25–30% of budget. Return `{ new_covered_through_seq, head_turn_ids }` or `None`.

**Patterns to follow:** pure, well-tested helper modules such as `src/login/sanitize.rs`; the constants convention.

**Test scenarios:**
- Happy path: under threshold (with or without an existing summary) → no plan.
- Happy path: over threshold → a plan advancing `covered_through_seq`; the verbatim tail (seq > boundary) fits the tail budget.
- Integration (R15): with an existing summary, the head to summarize is only the newly-uncovered rounds — already-covered rounds are not re-included.
- Edge case: a single recent round + new prompt larger than the tail budget still keeps the new prompt verbatim (overflow is handled by the U6 post-check, R16).
- Edge case: estimate exactly at the threshold boundary.

**Verification:** Deterministic unit tests over synthetic histories produce the expected split.

---

### U5. Summarization call + structured summary

**Goal:** Produce a structured, anchored summary of the head rounds via a hidden provider call; fail cleanly.

**Requirements:** R8, R9, R10, R11

**Dependencies:** U1, U4

**Files:**
- Create: `src/chat/summarize.rs` (build the summarization `ProviderRequest`, run via the provider stream, accumulate, return the summary text)
- Modify: `src/chat/mod.rs`
- Test: `src/chat/summarize.rs` (fake provider)

**Approach:**
- Build a summarization request: a system instruction asking for the structured sections (goal / key decisions / recent context / open threads / relevant files); input = the prior summary (anchored, when present) + the head rounds.
- Reuse the streaming accumulation from `stream_turn` but do not emit deltas to the TUI. Use the active model.
- Provider error → `Err` for the caller to fail the turn (R11). Never serialize keys; reuse the sanitized debug-log path.

**Patterns to follow:** delta accumulation in `src/chat/turn.rs`; provider streaming in `src/provider/kimi.rs`.

**Test scenarios:**
- Happy path: head rounds → a summary string (fake provider returns a canned structured summary).
- Integration: a prior summary is included in the summarization input (R10 anchoring).
- Covers AE5. Error path: provider error → `Err` with no partial summary.

**Verification:** With a fake provider, `summarize` returns structured text; the error path returns `Err`.

---

### U6. Worker-internal compaction + CompactionState

**Goal:** Run compaction inside the turn worker (one thread, one cancel token): assemble → estimate → summarize-if-over → re-assemble → re-estimate → main call; report the compaction result back on settle for the coordinator to persist.

**Requirements:** R7, R8, R11, R13, R16

**Dependencies:** U1, U4, U5

**Files:**
- Modify: `src/chat/turn.rs` (the worker runs assemble → estimate → summarize-if-over → re-assemble → re-estimate → main stream, all under its one `CancellationToken`; emits compaction started/finished; on summary error or still-over-budget it emits the terminal error event), `src/conversation/state.rs` (`LoopState` holds `CompactionState { summary: Option<String>, covered_through_seq }`; passes a transcript snapshot + `CompactionState` + budget into the job; on settle applies the reported compaction result — gated by the existing `cancelling` logic), `src/conversation/mod.rs` (`TurnJob` carries the snapshot/state/budget; the settle `Command`/event carries an optional compaction result)
- Test: `src/conversation/tests.rs` (fake runner)

**Approach:**
- The worker (extended `stream_turn`) does the whole sequence on its own thread under the single cancel token: build messages via `request.rs` (U1) from the current `CompactionState`; estimate (U4); if over budget, emit compaction-started, call `summarize` (U5) over the newly-uncovered head + prior summary, re-assemble, re-estimate (post-compaction re-check); emit compaction-finished; then the main streaming call.
- All failure/stop paths funnel through the existing terminal-event → `settle()` gate: a summarization error settles `error` (R11); still-over-budget after compaction settles a distinct "input too large" error (R16); a cancel at any point settles `cancelled` via the existing `cancelling` gate (R13) — no fresh token minted mid-turn, no new command-handler race, no error masquerading as a cancel.
- On a successful compaction the worker returns `summary` + new `covered_through_seq` alongside the terminal event; the coordinator (single writer) applies it to `CompactionState` and persists (U7) as part of settling — and skips that apply/persist when the turn is being cancelled.

**Execution note:** Start with failing worker/coordinator tests for the over-budget path and the cancel-during-compaction path.

**Patterns to follow:** the single-worker `stream_turn` + terminal-event flow in `src/chat/turn.rs`; the `cancelling` gate in `settle()`/`emit_current_delta()` (`src/conversation/state.rs`); `CancellationToken` in `src/chat/types.rs`.

**Test scenarios:**
- Happy path (under budget): no compaction; the turn runs with the current assembly (full or already-summarized).
- Happy path (over budget): compaction runs, the re-check passes, the turn runs with summary + tail; `CompactionState` is updated on settle.
- Covers AE5 (R11). Error path: summarization fails → `error` settle; no main call.
- Error path (R16): still over budget after compaction (oversized prompt/tail) → distinct "input too large" `error` settle; no main call.
- Edge case (R13): Esc during compaction → `cancelled` settle (not error), no fresh token, no main call, and no summary applied/persisted.
- Integration (R10): a second over-budget turn extends the prior summary (head = only newly-uncovered rounds).

**Verification:** With a fake provider, the worker compacts before the main call when over budget, re-checks the budget, and the coordinator applies/persists the summary only on a non-cancelled settle.

---

### U7. Persist compaction to JSONL + restore on resume

**Goal:** Append a `Compacted` event to the session log; on resume, restore full turns (display) plus the latest compaction state (assembly).

**Requirements:** R3, R14, R15

**Dependencies:** U6

**Files:**
- Modify: `src/conversation/session_log.rs` (add a `Compacted` event variant), `src/conversation/persistence.rs` (`on_compacted` appends the event + bumps `modified_at`), `src/backend/sessions.rs` (`restore_turns` also parses the latest `Compacted` → returns compaction state; `resume_session` forwards it), `src/conversation/mod.rs` (`Command::ResumeSession` carries compaction state), `src/conversation/state.rs` (apply restored `CompactionState`), `src/store/sessions.rs` (`SessionLogEventWire` tolerates the new event kind)
- Test: `src/conversation/persistence.rs` (inline), `src/backend/tests.rs` (resume round-trip)

**Approach:**
- New `SessionLogEvent::Compacted { covered_through_seq, summary, at_ms }` (tagged, camelCase, matching the existing event style).
- `on_compacted` appends it; real turns continue to be logged/restored exactly as today, so the transcript stays full history (R3).
- Resume parses all events; the latest `Compacted` defines the restored `CompactionState`; the coordinator restores both the full turns (display) and that `CompactionState`. Because U1's assembly always consumes `CompactionState`, the *next* turn after resume already sends `summary + verbatim tail` (not the full pre-compaction history) even when it estimates under budget — this is what satisfies R15/AE6.
- SQLite is unchanged (no migration); `parse_session_log`/`SessionLogEventWire` in `src/store/sessions.rs` must not choke on the new kind so reindex/listing still works.

**Patterns to follow:** `SessionLogEvent` + `append_event` in `src/conversation/session_log.rs`; `restore_turns` in `src/backend/sessions.rs`; `parse_session_log` in `src/store/sessions.rs`.

**Test scenarios:**
- Happy path: compaction appends a `Compacted` event to the JSONL.
- Covers AE6 (R15). Integration: resuming a log with a `Compacted` event restores all real turns AND `CompactionState` = latest summary + boundary.
- Covers AE6 (R15). Integration: after resuming a compacted session, a first turn that estimates under budget sends `summary + verbatim tail`, not the already-covered rounds.
- Edge case: multiple `Compacted` events → the latest wins.
- Covers AE3 (R3). Edge case: after resume, the transcript body contains all real turns.
- Edge case: `reindex_sessions_from_logs` still parses a log containing `Compacted` events (session still lists).

**Verification:** Round-trip test: compact → append → resume → state restored and session still lists.

---

### U8. "Auto compacting…" status: protocol + TUI

**Goal:** Surface a distinct status-bar state while compaction runs, returning to "Working" for the main call.

**Requirements:** R12, R13

**Dependencies:** U6

**Files:**
- Modify (Rust): `src/protocol/queue.rs` (compaction-started/finished notification constant(s) + params), `src/protocol/mod.rs` (exports), the `ConversationEvent`→notification mapping in `src/backend/` (emit the new notifications)
- Modify (TS): `tui/src/contracts/backend/messages.ts` (mirror constant + type), `tui/src/backend/protocol/messageProtocol.ts` (notification descriptor), `tui/src/contracts/backend/client.ts` + backend client impl (surface as a `TranscriptEvent` variant or dedicated handler), `tui/src/backend/runtime/backendRuntime.ts` (set a compaction-in-progress atom), `tui/src/state/ui/statusHint.ts` (`AUTO_COMPACTING_HINT` + `compactionInProgressAtom`), `tui/src/components/StatusBar.tsx` (precedence)
- Test: `src/protocol/tests.rs`, `tui/src/__tests__/components/StatusBar.test.tsx`, `messageProtocol` mirror test

**Approach:**
- Add compaction-started/finished as an extension of the existing transcript-event seam (per the backend-lifecycle learning — no parallel channel), carrying `turn_id`. The worker emits them when entering/leaving compaction; the TUI also clears the compaction state on any terminal settle for the turn (finished, error, or cancel), so a failed or cancelled compaction never leaves the status stuck on "Auto compacting…" (R13).
- The TUI maps these to a `compactionInProgressAtom`; `StatusBar` renders `AUTO_COMPACTING_HINT` (`kind: 'loading'`) with precedence above `WORKING_STATUS_HINT` (startup > compaction > working > copy), via `safeChromeColumnsAtom`.
- Preserve the animated-dots caret-in-lockstep behavior (`loadingFrameAtom`) and mirror the Rust↔TS constants in lockstep.

**Patterns to follow:** `WORKING_STATUS_HINT` + `turnInFlightAtom` + `StatusBar` precedence; `onTranscriptEvent` wiring in `backendRuntime.ts`; protocol-mirror discipline in `messages.ts`.

**Test scenarios:**
- Covers AE4. Happy path: compaction-started → status shows "Auto compacting…"; finished → back to "Working".
- Covers R13. Edge case: a cancel or error settle while compacting clears the "Auto compacting…" status (never stuck).
- Edge case: the status renders within the safe chrome width (no last-column clip).
- Integration: the Rust notification constant equals the TS mirror (lockstep test).
- Edge case: the composer caret stays on its row across compaction spinner frames (rendering check per `tui/AGENTS.md`).

**Verification:** `StatusBar` test shows the compaction hint precedence; `cargo test`, `cargo xtask tui-typecheck`, and `cargo xtask tui-test` pass.

---

## System-Wide Impact

- **Interaction graph:** request assembly (`src/chat`, worker-side), coordinator lifecycle + `cancelling` gate (`src/conversation/state.rs`), context budget (`src/chat/context_budget.rs`), protocol notifications (Rust + TS lockstep), TUI status bar. Git metadata is computed off the coordinator thread.
- **Error propagation:** compaction failure settles the active turn as error through the existing settle path; provider errors stay sanitized (`ProviderError::kind`).
- **State lifecycle risks:** `CompactionState` is single-writer in the coordinator (applied only on a non-cancelled settle), persisted only via the JSONL `Compacted` event and restored on resume; the visible transcript is never mutated by compaction.
- **API surface parity:** every new protocol notification is mirrored Rust↔TS; Rust params keep `deny_unknown_fields` + camelCase.
- **Integration coverage:** over-budget end-to-end with a fake provider; resume round-trip restoring compaction state; reindex tolerating the new event.
- **Unchanged invariants:** SQLite schema (no migration); credentials never serialized to DB/JSONL; the transcript body always equals full real history.

---

## Alternative Approaches Considered

- **Two-phase coordinator-orchestrated compaction** (coordinator estimates, spawns a compaction worker that reports `CompactionSettled`/`CompactionFailed`, then the coordinator spawns the main-turn worker): rejected. The existing turn machinery is strictly single-phase — one worker, one terminal event, one `active_thread.take()+join()`, a fresh `CancellationToken` per spawn. The two-phase shape would force re-implementing `settle()`'s `cancelling` gate inside new command handlers (else an Esc during compaction surfaces as an *error*, not a cancel), a second `active_thread` handoff, and risks dispatching a full call under a fresh token after the user already cancelled. Worker-internal compaction keeps one worker, one token, one settle gate — eliminating that race class.
- **Reading `context_window` from `/models` at turn time**: deferred. `/models` is fetched only at login and never persisted, so turn-time budget resolution would need new plumbing (persist the window with the active selection, thread it into `KimiConfig`). A configured 256k constant is correct for Kimi today and unblocks the feature.
- **Duplicating full history into SQLite** (the original request): dropped during the brainstorm/plan dialogue in favor of JSONL-truth + SQLite-as-listing-index (see origin). Recorded so the decision trail is explicit.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Token estimate inaccuracy triggers too early/late | Conservative ~70–75% threshold + reserved-output headroom; post-compaction re-check (R16) catches residual overflow; provider-usage refinement deferred |
| Compacted request still over budget (oversized new prompt/tail, grown summary) | Worker re-estimates after compaction and settles a distinct "input too large" error (R16) instead of a doomed call |
| Compaction↔cancel race / cancel surfacing as an error | One worker under one `CancellationToken`; all outcomes funnel through the existing `settle()` `cancelling` gate — no fresh token, no new command handlers (see Alternatives Considered) |
| `git status` (blocking ≤2s) stalls the single-writer coordinator | Compute git metadata off the coordinator thread (worker-side / precomputed), matching the existing `spawn_git_status` offload |
| Resume sends full history / re-summarizes covered rounds | U1 assembly always consumes `CompactionState`, so estimate/live/resume share one path (R15/AE6) |
| Rust↔TS protocol drift on the new notification | Lockstep constants + a mirror test (per existing convention) |
| Status/caret rendering regression | Render via `safeChromeColumnsAtom`; keep `loadingFrameAtom` lockstep; manual cursor check per `tui/AGENTS.md` |
| `reindex`/listing breaks on the new `Compacted` event | `SessionLogEventWire` in `src/store/sessions.rs` handles/ignores the new kind |

---

## Documentation / Operational Notes

- After landing, capture the net-new areas with `/ce-compound` (the learnings pass found zero coverage for the conversation coordinator/turn lifecycle, session persistence/resume, and compaction).
- Validation commands: `cargo test --workspace`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo fmt --check`; TUI via `cargo xtask tui-typecheck` and `cargo xtask tui-test`.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-07-09-conversation-history-and-auto-compaction-requirements.md](docs/brainstorms/2026-07-09-conversation-history-and-auto-compaction-requirements.md)
- Related brainstorm: `docs/brainstorms/2026-07-09-interactive-user-question-window-requirements.md`
- Related code: `src/chat/turn.rs`, `src/conversation/state.rs`, `src/conversation/session_log.rs`, `src/backend/sessions.rs`, `src/chat/context_budget.rs`, `src/chat/request.rs`, `src/protocol/queue.rs`, `tui/src/components/StatusBar.tsx`
- Learnings: `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`, `.../terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`, `.../state-libs-layering-and-cycle-verification-in-the-ink-tui.md`
