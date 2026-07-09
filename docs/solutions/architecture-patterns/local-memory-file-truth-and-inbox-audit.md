---
title: Local memory as file truth with a rebuildable index and inbox audit
date: "2026-07-09"
category: docs/solutions/architecture-patterns/
module: core
problem_type: architecture_pattern
component: memory
severity: medium
symptoms:
  - "Durable memory/state must survive a deleted or corrupt SQLite database"
  - "Automatic writes need review/undo without leaking secrets into the index"
  - "Memory content is untrusted and could carry prompt-injection payloads"
applies_when:
  - "A local subsystem needs durable, inspectable, correctable state"
  - "SQLite is used only as a fast, rebuildable index, not the source of truth"
  - "Automatic (model/worker) writes must be audited before becoming visible"
  - "Untrusted content is loaded into a model prompt"
tags:
  - file-truth
  - sqlite-index
  - event-sourcing
  - crash-recovery
  - inbox-audit
  - prompt-injection
  - memory
---

# Local memory as file truth with a rebuildable index and inbox audit

KQode's local memory system (`src/memory/`, `src/store/memory/`) is built so the
SQLite database is never the source of truth. The pattern generalizes to any
durable local subsystem that must stay inspectable, crash-recoverable, and safe
to feed into a model.

## Source-of-truth split

- **Topic markdown files** (`~/.kqode/memory/<scope>/<id>.md`) are the truth for
  remembered facts: JSON frontmatter (metadata) + markdown body. Human-readable
  and hand-correctable.
- **`memory_events.jsonl`** (append-only) is the truth for *lifecycle* state:
  operation intents, inbox proposals/reviews, rollback snapshots, correction
  suppression, cursor advances, and load traces.
- **SQLite (V3 index)** projects both. It is opened fail-closed at boot and
  fully rebuilt from files + the event log (`reindex_memory_from_files`) in one
  transaction, so deleting the DB loses nothing.

Because SQLite is a projection, it stores **no raw bodies** — only ids, hashes,
scope/type, confidence, and status (R18). Bodies live in the file/event truth.

## Crash recovery via operation intents + content hashes

Every mutation records an `OperationStarted` (with the expected `result_hash`)
before the atomic temp-write+rename, and `OperationApplied` after. On restart,
reconciliation compares the recorded intent against the on-disk content hash to
classify each pending op as applied or failed, then appends the terminal event
so the next reindex is idempotent. Forget is classified as landed whether it is
a hard remove or a soft deactivate.

## Audit before visibility (inbox)

Automatic (extraction) writes are proposal-only: the worker returns a structured
outcome; the **backend** — not the worker — validates, redacts secrets, scopes,
and commits. High-confidence updates persist their audit row + `ProposalBody`
*before* the active item is written (KTD9). Candidates stay inactive (never
prompt-loaded) until approved; undo restores from a `RollbackPoint` unless a
later edit conflicts. Correction suppression keys hash the item identity so a
rejected memory is not recreated without storing its content.

## Opaque, fail-closed scope identity

Repo/folder memory roots are keyed by opaque ids hashed from the *canonical*
workspace path, never raw local paths, so similarly-named workspaces stay
isolated; if canonical identity can't be resolved the scope fails closed rather
than guessing a shared root.

## Untrusted prompt loading

Loaded memory is bounded, deterministically ordered, and rendered as
clearly-delimited **untrusted facts** that must not override instructions.
Injection-shaped items are quarantined by scanning the *normalized* text that is
actually rendered (so a marker split across whitespace can't evade the scan),
and every load records a trace of ids/hashes only — never bodies.

## Why it holds

The design keeps three invariants that make the subsystem robust: files are
truth (DB is disposable), lifecycle is an append-only log (state is replayable),
and the index/trace never duplicate sensitive content (a DB or log leak exposes
no bodies). Sensitive purge additionally rewrites the event log to redact prior
bodies and leaves a content-free tombstone.
