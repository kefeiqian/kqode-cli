---
date: 2026-07-13
topic: tui-interrupt-keys-esc-skip-ctrl-c-stop
---

# TUI Interrupt Keys: ESC Skips, Ctrl+C Stops

## Summary

Make ESC and Ctrl+C a coordinated pair for interrupting a streaming turn. ESC stays the surgical *skip* — it cancels the one running turn and lets the next queued prompt continue. Ctrl+C becomes *stop* — one press cancels the running turn **and** clears any pending queued prompts, dropping the session to idle, where Ctrl+C keeps its existing two-step exit.

---

## Problem Frame

While a response streams, the user's reflex is to hit Ctrl+C to stop it. Today Ctrl+C has no awareness of a live turn: it only arms the two-step exit (or clears composer text), so a user trying to stop generation instead arms an exit — and a second reflexive press can quit the app while the model is still generating. The key that actually cancels a running turn is ESC (`handleEscCancelTurn`), which most users don't reach for first.

The backend can already stop a request promptly: on a cancel it drops the in-flight stream within ~50ms. The gap is purely at the interaction layer — Ctrl+C is not wired to that cancellation, and the desired behavior around queued prompts and app-exit precedence has never been defined.

There is one more wrinkle: prompts can be queued behind a streaming turn (type + Enter while it streams), so "stop" has to decide what happens to that queue. And Ctrl+C is already overloaded a third way — it copies an active transcript selection — so any new behavior must slot into a defined precedence order.

---

## Behavior matrix

The observable behavior, assuming **no active transcript selection** (an active selection makes Ctrl+C copy it first — see R5):

| State | ESC (skip) | Ctrl+C (stop / exit) |
|---|---|---|
| Streaming, no queue | Cancel running turn → idle | Cancel running turn → idle |
| Streaming, queue pending | Cancel running turn; next queued prompt starts | Cancel running turn **and** clear the queue → idle |
| Idle, composer has text | Existing clear-input arm | Clear composer |
| Idle, composer empty | Existing surface-dismiss behavior | Arm exit → second press exits |

ESC and Ctrl+C diverge only when a queue exists (ESC continues it, Ctrl+C clears it) and at idle (ESC clears input, Ctrl+C exits).

---

## Requirements

**ESC — skip the running turn**
- R1. While a turn is streaming, ESC cancels that running turn only; the next pending prompt (if any) continues as it does today. ESC's behavior is otherwise unchanged.

**Ctrl+C — stop**
- R2. While a turn is streaming, a single Ctrl+C cancels the running turn and clears all pending queued prompts, returning the session to idle in one press.
- R3. The Ctrl+C stop is immediate — it requires no confirmation/arm press. The two-step arm is reserved for exit while idle.
- R4. Ctrl+C stop consumes the key while busy: it does not arm exit and does not clear the composer, and any unsent composer draft is preserved.
- R5. An active transcript selection keeps its existing highest precedence: Ctrl+C with a live selection copies the selection and does not stop the turn. Stop applies only when no selection is active.

**Idle behavior (unchanged)**
- R6. When idle (no running turn), Ctrl+C keeps today's behavior: clear a non-empty composer on the first press, otherwise arm and confirm the two-step exit.
- R7. When idle, ESC keeps its existing behavior (clear-input arm / surface dismissal).

**Feedback**
- R8. A turn cancelled by ESC or Ctrl+C keeps the existing muted "Cancelled" transcript row.
- R9. Pending prompts cleared by Ctrl+C stop are removed from the transcript (they never ran); no "Dismissed" marker is shown, and no new busy-state status hint is added.

**Backend / protocol**
- R10. A backend operation cancels the running turn and clears all pending turns atomically, without clearing transcript history, session, or compaction state, so the session lands idle and no pending prompt auto-starts.
- R11. The stop operation, and any event announcing removed pending turns, are mirrored between the Rust protocol layer and the TS backend contracts in lockstep, consistent with the existing turn-cancel and conversation-clear methods.

---

## Acceptance Examples

- AE1. **Covers R2, R4.** Given a turn is streaming with two prompts queued behind it and an unsent draft in the composer, when the user presses Ctrl+C, then the running turn stops, both queued prompts are discarded, the session is idle, and the composer draft remains.
- AE2. **Covers R1.** Given a turn is streaming with one prompt queued behind it, when the user presses ESC, then the running turn is cancelled and the queued prompt starts streaming.
- AE3. **Covers R2, R6.** Given a turn is streaming and no selection is active, when the user presses Ctrl+C once and then again after the session lands idle with an empty composer, then the first press stops the turn and the second press arms exit (a third exits).
- AE4. **Covers R5.** Given a turn is streaming and a transcript selection is active, when the user presses Ctrl+C, then the selection is copied and the running turn keeps streaming.
- AE5. **Covers R8, R9.** Given a turn is streaming with one queued prompt, when the user presses Ctrl+C, then the running turn shows a muted "Cancelled" row and the queued prompt's pending row disappears with no "Dismissed" marker.

---

## Success Criteria

- Pressing Ctrl+C while a response streams reliably stops it — and any queued prompts — in a single keystroke, and no longer risks arming or confirming an app exit mid-response.
- ESC still offers a one-key "skip to the next queued prompt," so the surgical case survives.
- A downstream implementer can build this without re-deciding key precedence, queue semantics, or feedback: the behavior matrix and acceptance examples pin the observable behavior, leaving only the backend command shape and protocol naming as planning work.

---

## Scope Boundaries

- No per-item / LIFO queue cancellation (retracting a specific queued prompt while protecting the running turn).
- No change to ESC's current behavior.
- No change to backend cancellation latency — it is already immediate (~50ms).
- No "Dismissed" transcript rows and no new busy-state status hint.
- No support for multiple concurrent running turns — the runtime is strictly one running turn plus a flat pending queue.

---

## Key Decisions

- **Two keys, two jobs.** ESC = skip, Ctrl+C = stop. Rejected both a single unified action and a LIFO "peel the stack" model; the stack's only unique payoff — surgically retracting one queued prompt while protecting the running turn — was niche and the highest-cost to build.
- **Ctrl+C stop clears the pending queue.** A cancel means "stop this line of work," so the next (likely dependent) queued prompt should not auto-start. This assumes queued prompts are typically dependent follow-ups.
- **ESC stays surgical.** Cancelling only the running turn keeps the original "stop the running request immediately" need served by one key, distinct from Ctrl+C's fuller stop.
- **Selection-copy keeps highest Ctrl+C precedence.** An active highlight is still copied before stop applies, preserving the existing modeless-selection behavior.
- **Immediate stop, no arm.** Consistent with ESC; only exit (while idle) uses the two-step arm.

---

## Dependencies / Assumptions

- **Backend cancel is already immediate.** The stream loop polls the cancellation token every ~50ms via a biased `tokio::select!` and drops the in-flight HTTP stream (`src/chat/turn.rs`), so no latency work is needed.
- **One running turn at a time.** Pending prompts form a flat FIFO behind the single running turn (`src/conversation/state.rs`: `enqueue` marks new turns pending when one is active; a single `active_cancel`/`active_thread`; `activate_next_pending` promotes exactly one).
- **A new backend operation is required.** Existing `Command::Cancel` cancels only the active head and then auto-advances the queue; existing `Command::Clear` drops pending but also wipes transcript, session, and compaction state. Neither yields "stop running + drop pending, keep history."
- **Protocol is mirrored in lockstep.** Rust (`src/protocol/`) and TS (`tui/src/contracts/backend/`) method names and param/result shapes must change together; the new stop method and any pending-removed event are added on both sides.
- If independent-task queuing (unrelated prompts queued together) becomes a common pattern, revisit whether Ctrl+C should cancel the running turn only instead of clearing the queue.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R10][Technical] Exact backend shape for "stop running + drop pending": a single new command vs. drop-pending-then-cancel-active, and whether removed pending turns are announced per-prompt or in bulk. The ordering must drop pending before the active settles so `activate_next_pending` finds nothing.
- [Affects R5][Technical] Confirm the precedence wiring in the global key handler so the order selection-copy → stop (busy) → idle clear/exit holds without racing the composer input hook.
