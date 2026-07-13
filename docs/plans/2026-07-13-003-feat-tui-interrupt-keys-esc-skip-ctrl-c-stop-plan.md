---
title: "feat: TUI interrupt keys — ESC skips, Ctrl+C stops"
type: feat
status: completed
date: 2026-07-13
origin: docs/brainstorms/2026-07-13-tui-interrupt-keys-esc-skip-ctrl-c-stop-requirements.md
---

# feat: TUI interrupt keys — ESC skips, Ctrl+C stops

## Summary

Wire Ctrl+C to interrupt a streaming turn. A new backend `kqode.turn.stop` operation cancels the running turn and drops all pending queued prompts to idle (preserving transcript/session/compaction), announcing each dropped prompt via a new `kqode/turnRemoved` notification. The TUI's global-key handler gains a "busy → stop" branch that sits after selection-copy and before the idle clear/exit path. ESC keeps its existing "cancel the running turn only" behavior unchanged.

---

## Problem Frame

While a response streams, Ctrl+C today only arms the two-step exit (or clears composer text) — so a user reflexively pressing it to stop generation instead risks quitting the app, while the key that actually cancels a turn is ESC. See origin for the full pain narrative and the two-key model decision (`docs/brainstorms/2026-07-13-tui-interrupt-keys-esc-skip-ctrl-c-stop-requirements.md`).

---

## Requirements

Traced to the origin requirements doc.

- R1. ESC cancels the running turn only; the next pending prompt continues (unchanged).
- R2. A single Ctrl+C while streaming cancels the running turn and clears all pending prompts → idle.
- R3. Ctrl+C stop is immediate (no arm); the two-step arm is reserved for exit while idle.
- R4. Ctrl+C stop consumes the key while busy: no exit arm, no composer clear; composer draft preserved.
- R5. An active transcript selection keeps highest Ctrl+C precedence (copy wins; stop does not fire).
- R6. Idle Ctrl+C keeps today's behavior: clear a non-empty composer, else two-step exit.
- R7. Idle ESC keeps its existing behavior.
- R8. A turn cancelled by ESC or Ctrl+C keeps the existing muted "Cancelled" transcript row.
- R9. Pending prompts cleared by Ctrl+C are removed from the transcript — no marker, no new busy-state hint.
- R10. A backend operation cancels the running turn + clears all pending atomically, without clearing transcript/session/compaction, landing idle (no pending auto-starts).
- R11. The stop method and the removed-turn event are mirrored Rust↔TS in lockstep, like the existing cancel/clear methods.

**Origin acceptance examples:** AE1 (covers R2, R4), AE2 (covers R1), AE3 (covers R2, R6), AE4 (covers R5), AE5 (covers R8, R9).

---

## Scope Boundaries

- No per-item / LIFO queue cancellation (retracting one queued prompt while protecting the running turn).
- No change to ESC's behavior, backend cancellation latency, or `/clear` semantics.
- No "Dismissed" transcript rows and no new busy-state status hint.
- No support for multiple concurrent running turns (runtime is one running turn + a flat FIFO queue).

### Deferred to Follow-Up Work

- Making dropped pending prompts also vanish on **resume** (they will render as muted "Cancelled" rows — see Key Technical Decisions): a dedicated "dropped" settled kind or a resume-time filter, deferred unless the "Cancelled"-on-resume rendering is unacceptable.

---

## Context & Research

### Relevant Code and Patterns

- **Backend RPC contract:** `src/protocol/mod.rs` (`RpcMethod` enum + `as_str`/`from_method`), `src/protocol/queue.rs` (`TurnCancelParams`/`TurnCancelResult`, `ConversationClearParams`, `SETTLED_KIND_CANCELLED`, per-turn notification params). `kqode.turn.stop` should mirror `TurnCancel`; empty params should mirror `ConversationClearParams {}`.
- **Backend dispatch + event→notification:** `src/backend/mod.rs` (`handle_request` match, `handle_turn_cancel`, `handle_conversation_clear`, `notifications_for_event`).
- **Coordinator behavior:** `src/conversation/mod.rs` (`Command`, `ConversationEvent`), `src/conversation/state.rs` (`Command::Cancel` guard, `clear()`, `settle()`, `activate_next_pending`), `src/conversation/transcript.rs` (`drop_pending`, `remove_turn`, `active_id`), `src/conversation/persistence.rs` (`on_enqueue`/`on_settle`/`on_clear`).
- **Resume behavior (load-bearing edge):** `src/backend/sessions.rs` `restore_turns` resurrects any enqueued-but-unsettled turn as an `"interrupted"` error row — so dropped pending must receive a persisted terminal settle.
- **TS contract mirror:** `tui/src/contracts/backend/messages.ts` (method-name constants + `…Params`/`…Result` with `/** Must match RpcMethod::X … */` doc-comments), `tui/src/contracts/backend/client.ts` (`BackendClient` seam + `TranscriptEvent` union).
- **TS client + protocol descriptors:** `tui/src/backend/client/messageConnectionClient.ts` (`cancelTurn`, notification subscriptions, `emit`), `tui/src/backend/client/backendClient.ts` (lifecycle wrapper delegating via `withClient`), `tui/src/backend/protocol/messageProtocol.ts` (`turnCancelRequest`, `turnSettledNotification` descriptors).
- **TS queue read-model:** `tui/src/libs/promptQueue/transcriptReducer.ts` (`reduceTranscriptEvent`, `settleTurn`, `settledTurnIds`, generation guard), `tui/src/libs/promptQueue/promptQueue.ts` (`turnResultToBackendResult`, `QueueItem`), `tui/src/state/promptQueue/atoms.ts` (`transcriptEventAtom`, coalescer handling).
- **Key handling:** `tui/src/useGlobalKeys.ts` (owns Ctrl+C: selection-copy → clear/exit), `tui/src/components/PromptComposer/input/handleEscCancelTurn.ts` (ESC cancel, unchanged), `tui/src/components/PromptComposer/usePromptComposerInput.ts` (composer ignores Ctrl+C), `tui/src/state/ui/keyArm.ts` + `tui/src/constants/ui.ts` (`ArmedAction`, `PRESS_AGAIN_TO_EXIT_HINT`).
- **Tests to mirror:** `src/conversation/tests.rs` (`cancel_active_settles_cancelled_and_promotes_next`, `clear_drops_pending_and_abandons_active`), `src/conversation/test_support.rs` (event harness), `tui/src/__tests__/App.test.tsx` (Ctrl+C/ESC cases, `stdin.write('\u0003')`, ~80ms ESC wait), `tui/src/backend/client/__tests__/backendClient.test.ts`, `tui/src/libs/promptQueue/__tests__/transcriptReducer.test.ts`.

### Institutional Learnings

- **Extend the injected `BackendClient` seam, keep isolation green** (`docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`): add the stop op as a seam method; do not import process/launch code in `state/**` or `components/**` (`tui/src/__tests__/backendIsolation.test.ts` enforces this). The doc's "`submitMessage` only" seam snapshot is stale — the live seam already carries `cancelTurn`/`clearConversation`.
- **Mirror the RPC exactly like `TurnCancel`/`ConversationClear`** (live contract convention): matching wire constant + `…Params`/`…Result` on both sides with the "Must match `RpcMethod::X`" doc-comment. Landing multi-file Rust↔TS contract changes on a shared branch is collision-prone — probe `git status` before batch edits, re-read fresh on collision, gate with typecheck + test + a residue grep.
- **State-vs-libs layering** (`docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`): pure queue-drop/derivation logic + types belong in `tui/src/libs/promptQueue/` with colocated `__tests__`; `tui/src/state/promptQueue/` stays atoms-only; `libs` must never import `@state`. Run the stdlib cycle-check after adding files.
- **Transcript truth vs config** (`docs/solutions/database-issues/divergent-migration-history-points-to-reset-not-upgrade.md`): the stop op must not reset session/compaction; it only cancels the head and drops the pending queue. Keep `eol=lf` on any new fixtures.
- **Gaps (no prior learnings):** Ink `useInput` precedence/racing hooks, turn-cancellation command-loop internals, and key-event/debounce test patterns are undocumented — capture with `/ce-compound` after landing.

---

## Key Technical Decisions

- **New `kqode.turn.stop` with empty params**, mirroring `kqode.conversation.clear` — a distinct wire verb keeps the two-key UX (skip vs stop) legible, and empty params make it race-safe ("stop the current active + all pending", no `turn_id` to go stale).
- **New per-pending `kqode/turnRemoved` notification**, mirroring the existing per-turn event style. The TUI removes the matching queued row on receipt (vanish, R9). The active turn still settles through the existing `kqode/turnSettled` cancelled path (muted "Cancelled" row, R8).
- **`Command::Stop` preserves history.** Unlike `Command::Clear`, it does not reset compaction, session, summary state, or drop settled turns. Order: drop pending (emit `TurnRemoved` for each) first, then cancel the active turn — so when the active settles, `activate_next_pending` finds nothing and the session lands idle.
- **Dropped pending persist as terminal cancelled settles**, so `restore_turns` never resurrects them as `"interrupted"` errors. Consequence: a later **resumed** session renders them as muted "Cancelled" rows rather than hiding them (user-accepted; full resume-hiding is deferred).
- **Backend-authoritative removal.** The TUI drains the queue from `turnRemoved`/`turnSettled` events, not optimistic local mutation, consistent with the backend-owned transcript mirror (enqueue stays optimistic as today). Removed `turnId`s are added to `settledTurnIds` so a late event cannot resurrect them.
- **"Busy" = `activeTurnIdAtom` non-null** (the same signal the ESC-cancel handler uses). Ctrl+C stop fires only when busy, after the selection-copy branch, and consumes the key.
- **Pure queue logic in `libs/promptQueue/`**, atoms-only in `state/promptQueue/`; run the cycle-check after adding files.
- **ESC is unchanged** — no edit to `handleEscCancelTurn`.

---

## Open Questions

### Resolved During Planning

- Exact backend command/event shape (origin deferred): resolved — `kqode.turn.stop` (empty params) + per-pending `kqode/turnRemoved`; `Command::Stop` drops pending then cancels active.
- Precedence wiring (origin deferred): resolved — in `useGlobalKeys`, order is selection-copy → busy-stop → idle clear/exit; the composer hook keeps ignoring Ctrl+C, so no cross-hook race.

### Deferred to Implementation

- Exact persistence call for dropped pending (`on_settle` with a cancelled result vs. a dedicated path) — verify against `restore_turns` with a resume test that asserts no `"interrupted"`/duplicate rows.
- Establishing the key-event + Ink-debounce test pattern for the new Ctrl+C-stop cases (no prior learning) — model on `App.submit.test.tsx`'s injected-client + seeded-active-queue pattern; capture the pattern with `/ce-compound` after.
- [UX] Whether to add a short post-stop cooldown before the idle exit-arm becomes reachable, to fully absorb a reflexive Ctrl+C burst that straddles the busy→idle boundary. Default: rely on the in-flight window (no cooldown) plus the reflexive-burst test; add a cooldown only if over-exit is observed in practice.
- [UX] Confirm the docked-surface / too-small precedence defaults (stop fires, surface stays open, too-small stop is silent until the transcript remounts on re-enlarge).
- [Technical] Whether `messageConnectionClient.emit` should delete removed `turnId`s from `inFlightTurnIds` (as it does for `settled`), to avoid a redundant transport-failure `settled` on connection close for a dropped-then-disconnected pending turn (currently harmless — the reducer ignores it via `settledTurnIds`).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Ctrl+C / ESC decision matrix** (assumes no active transcript selection; an active selection makes Ctrl+C copy first, per R5):

| State | ESC (skip) | Ctrl+C (stop / exit) |
|---|---|---|
| Streaming, no queue | cancel running turn → idle | stop: cancel running turn → idle |
| Streaming, queue pending | cancel running; next queued starts | stop: cancel running + drop queue → idle |
| Idle, composer has text | existing clear-input arm | clear composer |
| Idle, composer empty | existing surface dismiss | arm exit → second press exits |

The matrix is the Home-screen view. While a turn streams, Ctrl+C stops it even under a docked command surface or the too-small notice (busy-stop keys on the active turn, not the surface); the surface stays open, and a too-small stop's "Cancelled" row appears when the terminal is re-enlarged and the transcript remounts.

**Stop round-trip** (directional): Ctrl+C (busy) → `stopTurn()` seam call → `kqode.turn.stop` → `Command::Stop` → coordinator emits one `TurnRemoved` per pending turn + a cancelled `Settled` for the active turn → TS reducer drops the removed queued rows and settles the active as "Cancelled" → queue drains to idle.

---

## Implementation Units

### U1. Backend `kqode.turn.stop` protocol contract

**Goal:** Add the wire contract for the stop request and the removed-turn notification on the Rust side.

**Requirements:** R10, R11

**Dependencies:** None

**Files:**
- Modify: `src/protocol/mod.rs` (add `RpcMethod::TurnStop` → `"kqode.turn.stop"` in the enum, `as_str`, and `from_method` list)
- Modify: `src/protocol/queue.rs` (add `TurnStopParams` (empty, `deny_unknown_fields`) + `TurnStopResult { ok }`; add `TURN_REMOVED_METHOD = "kqode/turnRemoved"` + `TurnRemovedParams { turn_id }`)
- Test: `src/protocol/tests.rs`

**Approach:**
- Mirror `TurnCancel`/`ConversationClear`: empty params like `ConversationClearParams`, `camelCase`, `deny_unknown_fields` on params.
- `TurnRemovedParams` mirrors the single-`turnId` shape of `ActivatedParams`.

**Patterns to follow:** `TurnCancelParams`/`TurnCancelResult` and `ConversationClearParams` in `src/protocol/queue.rs`; the `rpc_method_maps_clear_and_cancel_methods` and `clear_and_cancel_contracts_use_camel_case` tests in `src/protocol/tests.rs`.

**Test scenarios:**
- Happy path: `RpcMethod::from_method("kqode.turn.stop")` → `Some(TurnStop)`; `as_str` round-trips.
- Edge case: `TurnStopParams` parses `{}` and rejects unknown fields.
- Happy path: `TurnStopResult { ok: true }` serializes to `{ "ok": true }`.
- Happy path: `TurnRemovedParams { turn_id }` serializes to `{ "turnId": … }` and round-trips.

**Verification:** New method resolves; params/result/event types round-trip in camelCase; `cargo test -p` protocol tests pass.

---

### U2. `Command::Stop` coordinator behavior

**Goal:** Cancel the active turn and drop all pending prompts without clearing history, emitting a `TurnRemoved` event per dropped prompt and persisting a terminal settle for each so resume never resurrects them.

**Requirements:** R2, R8, R9, R10

**Dependencies:** U1

**Files:**
- Modify: `src/conversation/mod.rs` (add `Command::Stop` and `ConversationEvent::TurnRemoved { turn_id }`)
- Modify: `src/conversation/state.rs` (handle `Command::Stop`)
- Test: `src/conversation/tests.rs`
- Modify (if the harness needs a removed-event assertion helper): `src/conversation/test_support.rs`

**Approach:**
- On `Command::Stop`: collect pending turn ids; for each, `transcript.remove_turn`, drop its `configs` entry, persist a terminal cancelled settle (so `restore_turns` sees a settled turn, not an unsettled `"interrupted"` one), and emit `ConversationEvent::TurnRemoved { turn_id }`.
- Then, if there is an active turn, set `cancelling = Some(active_id)` and trigger `active_cancel.cancel()` — its runner settles cancelled through the existing path (muted "Cancelled" row); because pending were already dropped, `activate_next_pending` returns `None` → idle.
- Do **not** reset `compaction`, `pending_compaction`, `summary_requested`, `active_config`, or call `drop_settled` (contrast with `clear()`).
- Route the new event through `notifications_for_event` in U3.

**Patterns to follow:** the `Command::Cancel` guard and `clear()`/`settle()` in `src/conversation/state.rs`; `Command::Clear`'s `drop_pending` usage; the `default_runner` cancel→settle mapping in `src/conversation/mod.rs`.

**Test scenarios:**
- Happy path (Covers AE5): active + two pending; `Command::Stop` → active settles `Cancelled`, two `TurnRemoved` events fire (one per pending), no `Activated` follows, and a fresh submit starts `Active` immediately.
- Edge case: active only, no pending → `Command::Stop` settles active `Cancelled`, emits zero `TurnRemoved`, idle.
- Edge case: `Command::Stop` with nothing active/pending → no events, no panic.
- Error/race path: active self-cancels then races a late completion → still settles `Cancelled` (stop does not regress the existing cancel-override guarantee).
- Integration: dropped pending turns are persisted as settled (spy persistence records an `on_settle` per dropped turn) so a subsequent `restore_turns` yields no `"interrupted"` rows for them.
- State lifecycle: an active compaction/summary state is preserved across `Command::Stop` (unlike `Command::Clear`).

**Verification:** Coordinator lands idle after stop with history intact; dropped pending emit removal events and are durably settled; `cargo test -p` conversation tests pass.

---

### U3. Backend dispatch + event→notification wiring

**Goal:** Route the `kqode.turn.stop` request to `Command::Stop` and map `TurnRemoved` to the `kqode/turnRemoved` notification.

**Requirements:** R10, R11

**Dependencies:** U1, U2

**Files:**
- Modify: `src/backend/mod.rs` (add `RpcMethod::TurnStop` arm → `handle_turn_stop`; add the `ConversationEvent::TurnRemoved` arm in `notifications_for_event`; import the new params/result/method)
- Test: `src/backend/tests.rs`

**Approach:**
- `handle_turn_stop` parses `TurnStopParams` (empty), sends `Command::Stop`, returns `TurnStopResult { ok: true }` — mirroring `handle_conversation_clear`.
- `TurnRemoved { turn_id }` → `Notification::new(TURN_REMOVED_METHOD, TurnRemovedParams { turn_id })`.

**Patterns to follow:** `handle_turn_cancel`, `handle_conversation_clear`, and the `notifications_for_event` arms in `src/backend/mod.rs`.

**Test scenarios:**
- Happy path: dispatching a `kqode.turn.stop` request sends `Command::Stop` and returns `{ ok: true }`.
- Happy path: a `TurnRemoved` event maps to a `kqode/turnRemoved` notification carrying `turnId`.
- Edge case: malformed params (non-object) → JSON-RPC invalid-params error, matching cancel's handler.

**Verification:** The method is reachable end-to-end at the backend boundary; removed events serialize to the mirrored notification; `cargo test -p` backend tests pass.

---

### U4. TS contract mirror + client seam

**Goal:** Mirror the stop method and removed event in the TS contracts, add `stopTurn()` to the `BackendClient` seam and both client layers, and subscribe to `turnRemoved`.

**Requirements:** R10, R11

**Dependencies:** U1

**Files:**
- Modify: `tui/src/contracts/backend/messages.ts` (`TURN_STOP_METHOD`, `TURN_REMOVED_METHOD` constants; `TurnStopParams`/`TurnStopResult`/`TurnRemovedParams` types with "Must match `RpcMethod::…`" doc-comments)
- Modify: `tui/src/contracts/backend/client.ts` (add `stopTurn(): Promise<void>` to `BackendClient`; add `{ type: 'removed'; turnId: string }` to `TranscriptEvent`)
- Modify: `tui/src/backend/protocol/messageProtocol.ts` (add `turnStopRequest` RequestType + `turnRemovedNotification` NotificationType descriptors)
- Modify: `tui/src/backend/client/messageConnectionClient.ts` (implement `stopTurn` via `okRequest(turnStopRequest)`; `connection.onNotification(turnRemovedNotification, …)` → `emit({ type: 'removed', turnId })`)
- Modify: `tui/src/backend/client/backendClient.ts` (add `stopTurn` delegating through `withClient`)
- Test: `tui/src/backend/protocol/__tests__/messageProtocol.test.ts`, `tui/src/backend/client/__tests__/backendClient.test.ts`

**Approach:**
- Follow the exact mirror shape of `turnCancelRequest`/`TURN_CANCEL_METHOD` and `turnSettledNotification`.
- Any fake/stub implementing `BackendClient` in tests must gain `stopTurn` — TypeScript typecheck enforces this across all implementers.

**Patterns to follow:** the `cancelTurn` method + `turnSettledNotification` subscription in `messageConnectionClient.ts`; `cancelTurn` delegation in `backendClient.ts`; existing descriptor tests in `messageProtocol.test.ts`.

**Test scenarios:**
- Happy path: `stopTurn()` sends `kqode.turn.stop` and resolves on `{ ok: true }`.
- Error path: `stopTurn()` rejects with a `BackendClientError` on `!ok` and on transport failure.
- Integration: a `kqode/turnRemoved` notification emits a `{ type: 'removed', turnId }` transcript event to subscribers.
- Happy path: `turnStopRequest`/`turnRemovedNotification` descriptors carry the mirrored method names.

**Verification:** `cargo xtask tui-typecheck` passes (all `BackendClient` implementers updated); client seam sends the request and surfaces removed events.

---

### U5. Transcript reducer — handle the `removed` event

**Goal:** Drop the matching queued row when a `removed` event arrives, so cleared pending prompts vanish (R9).

**Requirements:** R9

**Dependencies:** U4

**Files:**
- Modify: `tui/src/libs/promptQueue/transcriptReducer.ts` (add a `removed` branch: remove the queue item by `turnId`, add `turnId` to `settledTurnIds`, delete any `streamingTextById` entry, respecting the existing generation/settled guards)
- Modify (routing only if needed): `tui/src/state/promptQueue/atoms.ts` (ensure `transcriptEventAtom` forwards `removed` to `applyTranscriptEvent`; no coalescer flush needed for never-streamed pending turns)
- Test: `tui/src/libs/promptQueue/__tests__/transcriptReducer.test.ts`

**Approach:**
- Mirror `settleTurn`'s bookkeeping (add to `settledTurnIds`, clean `streamingTextById`) but remove the item from `queue` instead of marking it `settled`.
- Handle `removed` **before** `ensureTurn` runs (or read the pre-`ensureTurn` queue): `reduceTranscriptEvent` calls `ensureTurn` ahead of the type dispatch, so a `removed` for an unknown `turnId` would otherwise create then immediately drop a phantom item (bumping `nextQueueItemId` and stamping a generation) instead of being a clean no-op.
- A `removed` for an already-settled `turnId` is a no-op via the `settledTurnIds` check.

**Patterns to follow:** `settleTurn`, `updateTurn`, and `stampTurnGeneration` in `transcriptReducer.ts`.

**Test scenarios:**
- Happy path (Covers AE5): reducing a `removed` event drops the matching queued item from the queue.
- Edge case: removing the only pending item leaves the active turn intact.
- Edge case: a `removed` for an unknown/already-settled `turnId` is a no-op.
- Integration: after `removed`, the `turnId` is in `settledTurnIds`, so a late event for it is ignored (no resurrection).

**Verification:** Queue drains dropped pending rows to nothing; `cargo xtask tui-test` reducer tests pass; the TUI cycle-check reports no new cycle.

---

### U6. Ctrl+C "stop" precedence in the global-key handler

**Goal:** Add the "busy → stop" branch to `useGlobalKeys` so Ctrl+C interrupts the running turn (and clears the queue) while streaming, keeping selection-copy first and idle exit/clear last.

**Requirements:** R1, R2, R3, R4, R5, R6, R7

**Dependencies:** U4, U5

**Files:**
- Modify: `tui/src/useGlobalKeys.ts`
- Test: `tui/src/__tests__/App.test.tsx`

**Approach:**
- Gate the busy-stop branch on `isCtrlC` and insert it **after** the existing `if (!isCtrlC) { … return; }` early-return and **before** the `if (armedAction === ArmedAction.Exit)` check — so ESC and every non-Ctrl+C key keep flowing to their handlers unchanged (R1/AE2), and only Ctrl+C reaches the stop logic.
- When it runs (Ctrl+C, no active selection) and `store.get(activeTurnIdAtom)` is non-null: call `store.get(backendClientAtom)?.stopTurn().catch(() => undefined)`, clear any `armedAction`, and `return` (consume the key — no exit arm, no composer clear).
- Otherwise fall through to today's idle logic (composer clear on first press with text, else two-step exit).
- Read `activeTurnIdAtom` from `@state/promptQueue`; the composer hook still ignores Ctrl+C, so there is no cross-hook race. ESC (`handleEscCancelTurn`) is untouched.
- Surface-state default: because the branch keys only on the active turn (not `activeSurfaceAtom`/`terminalTooSmallAtom`), Ctrl+C stops a streaming turn even while a command surface is docked or the too-small notice shows — states where Ctrl+C previously only armed exit. Keep this: the docked surface stays open, and a too-small stop is accepted-silent since the muted "Cancelled" row is backend-mirror state that reappears when the terminal is re-enlarged and the transcript remounts (see Open Questions).

**Patterns to follow:** the selection-copy branch and `ArmedAction.Exit` handling already in `useGlobalKeys.ts`; `handleEscCancelTurn.ts` for reading `activeTurnIdAtom` + `backendClientAtom`; `App.test.tsx` Ctrl+C cases for the key-event mechanics (`stdin.write('\u0003')`, `armedActionAtom` assertions, ~80ms ESC waits). Those existing cases are idle-only and inject **no** backend client, so model the new busy-state tests on `App.submit.test.tsx`'s pattern instead — it sets `backendClientAtom` and feeds `transcriptEventAtom`, which is what seeds an `active` `promptQueue` item (non-null `activeTurnIdAtom`) and, for AE3, drives a `turnSettled` cancelled event to return it to null.

**Test scenarios:**
- Happy path (Covers AE1): with an active turn (no selection), Ctrl+C calls `stopTurn`, does **not** arm exit, and leaves composer draft text intact.
- Happy path (Covers AE3): after stop lands idle (`activeTurnIdAtom` null) with an empty composer, the next Ctrl+C arms exit and a further Ctrl+C exits.
- Happy path (Covers AE4): with an active turn **and** an active transcript selection, Ctrl+C copies the selection and does **not** call `stopTurn`.
- Edge case: idle Ctrl+C with composer text clears the composer (existing behavior unchanged, no `stopTurn`).
- Regression (Covers AE2): ESC while streaming still cancels only the running turn (no `stopTurn`, queue-continue path unchanged).
- Edge case (reflexive burst): pressing Ctrl+C several times in rapid succession while streaming calls `stopTurn` but does **not** exit the app — while the stop is in flight `activeTurnIdAtom` stays non-null, so repeated presses stay in the busy-stop branch rather than arming exit.
- Edge case (docked surface): with a turn streaming and a command surface docked, Ctrl+C calls `stopTurn` and leaves the surface open (no exit arm).

**Verification:** Ctrl+C stops a streaming turn without arming exit; selection-copy and idle exit/clear precedence preserved; `cargo xtask tui-test` App tests pass.

---

## System-Wide Impact

- **Interaction graph:** `useGlobalKeys` (Ctrl+C), `usePromptComposerInput`/`handleEscCancelTurn` (ESC, unchanged), the transcript reducer, and the backend command loop. New request + notification cross the JSON-RPC boundary.
- **Error propagation:** `stopTurn` is fire-and-forget with `.catch` (non-fatal), matching `cancelTurn`; backend failures surface only as absent state changes, never a crash.
- **State lifecycle risks:** removed `turnId`s must enter `settledTurnIds` so late/racing events cannot resurrect a dropped row; the generation guard is respected; drop-pending-before-cancel-active ordering prevents an auto-started next turn.
- **API surface parity:** the new method + event must be mirrored Rust↔TS in lockstep; every `BackendClient` implementer (including test fakes) gains `stopTurn` (compiler-enforced).
- **Unchanged invariants:** ESC behavior, the one-running-turn invariant, backend cancel latency, `/clear` semantics, and selection-copy precedence are all preserved.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Multi-file Rust↔TS contract change on a shared branch collides with concurrent sessions | Probe `git status`/mtimes before batch edits; on collision STOP and re-read fresh; gate with `cargo xtask tui-typecheck` + tests + a residue grep for the old shape; commit with explicit pathspec. |
| Dropped pending resurrect as `"interrupted"` rows on resume | Persist a terminal cancelled settle per dropped pending (U2); add a resume test asserting no `"interrupted"`/duplicate rows. |
| Race: active turn settles between the TUI busy-check and the stop RPC | Empty-param stop drops pending and is a safe no-op on an already-gone active turn → still lands idle. |
| A `BackendClient` fake missing `stopTurn` | TypeScript typecheck flags every `: BackendClient`-typed fake that can reach the key handler (surface `testUtils`, `App.submit.test.tsx`); run `cargo xtask tui-typecheck`. `as unknown as`-cast fakes (e.g. `backendRuntime.test.ts`) bypass structural checking but never mount `useGlobalKeys`, so they cannot invoke `stopTurn`. |
| Backend isolation guardrail regressions | Keep the new op on the `contracts/backend` seam; no process/launch imports in `state/**` or `components/**` (`backendIsolation.test.ts`). |

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-07-13-tui-interrupt-keys-esc-skip-ctrl-c-stop-requirements.md](docs/brainstorms/2026-07-13-tui-interrupt-keys-esc-skip-ctrl-c-stop-requirements.md)
- Related code: `src/protocol/queue.rs`, `src/conversation/state.rs`, `src/backend/mod.rs`, `src/backend/sessions.rs`, `tui/src/useGlobalKeys.ts`, `tui/src/backend/client/messageConnectionClient.ts`, `tui/src/libs/promptQueue/transcriptReducer.ts`
- Institutional learnings: `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`, `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`, `docs/solutions/database-issues/divergent-migration-history-points-to-reset-not-upgrade.md`
