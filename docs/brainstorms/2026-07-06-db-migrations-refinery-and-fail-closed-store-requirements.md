---
date: 2026-07-06
topic: db-migrations-refinery-and-fail-closed-store
---

# Per-Version Schema Migrations via `refinery`, with a Fail-Closed Store

## Summary

Replace the hand-rolled inline-SQL migration runner (`src/store/migrations.rs`) with the `refinery` crate so each schema version lives in its own embedded per-version script (Alembic-style), and make the `~/.kqode/kqode.db` SQLite index a **hard startup dependency**: if it cannot open or migrate, the backend refuses to start instead of degrading to session-only. Migrations stay forward-only; recovery from a bad migration is a new forward version, not a rollback.

---

## Problem Frame

KQode already migrates its SQLite index at backend init via a bespoke runner: an ordered `STEPS: &[Step { version, sql: &'static str }]` array keyed off SQLite's `user_version` pragma, applied transactionally with double-checked locking (`src/store/migrations.rs`). It works and is well-tested, but **every migration's SQL is inlined as a `&'static str` constant in one file.** At `LATEST_USER_VERSION = 1` that is fine; the provider-config work already flagged the `sessions`/`turns` spine as "provisional… reshaped by the session milestone," so more versions are coming. As the history grows, one file of stringly-typed DDL constants becomes hard to read, diff, and review.

Separately, the store is currently **non-fatal by design**: `Store::open_or_bootstrap().ok()` in `src/backend/mod.rs` swallows any failure to `None`, and the backend still fires `kqode.backend.ready` and degrades to `.env`-only chat. A migration bug, a newer-than-known schema, or a corrupt index all silently reduce persistence rather than announcing themselves — the user cannot tell durable state stopped being written.

---

## Actors

- A1. User: Starts KQode; on a store failure they are the one blocked from working and must act on the error.
- A2. Rust backend init (`src/backend/mod.rs::run_stdio`): Opens/migrates the store, then emits `kqode.backend.ready`; owns the fatal-vs-continue decision.
- A3. Concurrent workspace instances: Two+ backends may boot at once against the same `~/.kqode/kqode.db`, racing on first-boot migration.
- A4. `refinery` runner + embedded migration scripts: Applies pending per-version scripts and tracks what has been applied.

---

## Key Flows

- F1. Cold/warm boot — migrate before ready (happy path)
  - **Trigger:** Backend process starts (`run_stdio`).
  - **Actors:** A2, A4
  - **Steps:** Open (creating if absent) `~/.kqode/kqode.db` → apply pragmas (WAL, busy-timeout) → run `refinery` to apply any pending per-version scripts → run a sanity read → only then establish the transport and emit `kqode.backend.ready`.
  - **Outcome:** The DB is at the binary's latest schema before any request is handled; the client observes readiness only after a successful migration.
  - **Covered by:** R2, R5, R6

- F2. Store failure — fail closed (unhappy path)
  - **Trigger:** Any step in F1 fails (open, migrate, checksum mismatch, newer-than-known schema, sanity read).
  - **Actors:** A1, A2
  - **Steps:** Backend does **not** emit ready and does **not** enter the request loop → surfaces an actionable error naming the DB path and the remedy → leaves the DB file on disk untouched.
  - **Outcome:** "No working DB = no start"; the user sees exactly why and what to do; no user data is deleted.
  - **Escape path:** User follows the error (e.g., deletes the stale DB per F3) and restarts.
  - **Covered by:** R6, R7, R8, R11

- F3. Pre-`refinery` v1 DB — one-time reset
  - **Trigger:** Backend (now `refinery`-based) starts against a DB already at `user_version = 1` from the old runner.
  - **Actors:** A1, A2, A4
  - **Steps:** `refinery` finds no history and tries `V1` → `CREATE TABLE` fails because the tables already exist → per F2 the fatal error tells the user to delete `~/.kqode/kqode.db` once and restart → the restart bootstraps cleanly.
  - **Outcome:** Existing (dogfood) DBs are reset once; no bridging code is built.
  - **Covered by:** R9

---

## Requirements

**Migration tooling and per-version layout**
- R1. Adopt the `refinery` crate as the schema-migration tool for `~/.kqode/kqode.db`, replacing the hand-rolled `STEPS`/`user_version` runner in `src/store/migrations.rs`.
- R2. Each schema version is its own per-version migration script (e.g., `V1__initial_schema.sql`), embedded into the `kqode` binary at compile time — no migration files are read from disk at runtime (required for the npm-distributed binary).
- R3. Migrations stay forward-only and additive-only; do **not** author down/rollback migrations even though `refinery` supports them. Recovery from a bad migration is a new forward version.
- R4. Rely on `refinery`'s per-migration checksum validation so an already-applied migration that was later edited is detected — machine-enforcing the existing "never edit or reorder a shipped migration" convention.

**Startup sequencing and fatal policy**
- R5. The migration run must complete before the backend emits `kqode.backend.ready` and before any request is handled (preserve the existing ordering in `src/backend/mod.rs`).
- R6. Any failure to open or migrate the store is fatal: the backend must not fire the ready/success signal and must not begin the request loop ("no working DB = no start"). This reverses the current graceful-degrade-to-session-only behavior.
- R7. On a fatal store failure, the backend surfaces an **actionable** error identifying the database path and the remedy (not a silent exit and not a degrade), so the user is never left with a hard-blocked backend and no path forward.
- R8. The database is never auto-deleted on any failure (a transient lock or FS error can masquerade as corruption); recovery is user-initiated.

**Compatibility, adoption, and robustness**
- R9. For DBs already at `user_version = 1` (migrated by the pre-`refinery` runner), a one-time manual reset is accepted for v0.1.3: `refinery` will fail against the pre-existing tables, and per R7 the fatal error must instruct the user to delete `~/.kqode/kqode.db` once and restart. Note this in the release notes/changelog.
- R10. Concurrent workspace boots must not hard-fail under the new fatal policy from a transient `SQLITE_BUSY`/locked condition; the existing busy-timeout + retry hardening (or an equivalent wrapper around `refinery`'s runner) must be preserved.
- R11. A database whose applied migrations are ahead of what this binary embeds (an older binary against a newer DB) must cause the backend to refuse to start, preserving today's `NewerSchema` downgrade protection.

**Code and documentation impact**
- R12. With the store now mandatory, remove the `Option<Store>` threading and treat the store as a hard `&Store` dependency across the backend (`src/backend/mod.rs`, `login.rs`, `providers.rs`, `resolve.rs`).
- R13. Update `AGENTS.md` and the `src/store` rustdoc to reflect the fail-closed policy, replacing the documented "every failure here is non-fatal / degrades to `.env`-only chat" statements; keep the "never auto-deleted" and "rebuildable index over JSONL truth" statements.

---

## Acceptance Examples

- AE1. **Covers R5, R6.** Given a fresh machine with no `~/.kqode/kqode.db`, when the backend starts, then it creates and migrates the DB to the latest version and only then emits `kqode.backend.ready`.
- AE2. **Covers R6, R7, R8.** Given a migration step that fails (e.g., a shipped migration bug), when the backend starts, then it does not emit ready, does not enter the request loop, surfaces an error naming the DB path and remedy, and leaves the DB file untouched.
- AE3. **Covers R9.** Given a DB already at `user_version = 1` from the old runner, when the `refinery` backend starts, then migration fails against the existing tables and the fatal error tells the user to delete `~/.kqode/kqode.db` and restart; after deletion, a restart bootstraps cleanly.
- AE4. **Covers R10.** Given two workspace backends starting simultaneously against the same fresh DB, when both attempt to migrate, then one applies the migrations and the other waits/retries and observes them applied — neither hard-fails from a transient lock.
- AE5. **Covers R11.** Given a DB with migrations ahead of this binary, when the backend starts, then it refuses to start rather than ignoring or downgrading the schema.

---

## Success Criteria

- Adding a new schema version is just dropping a new `V{n}__*.sql` file — no hand-edited version constants or `STEPS` array entry.
- A migration failure is impossible to miss: the user sees exactly why the backend won't start and what to do, and no user data is deleted.
- The DB is a genuine hard dependency: no backend code path has to handle an absent store.
- `ce-plan` can implement without inventing failure semantics, the v1-DB adoption story, or the concurrency/downgrade guarantees — they are specified here.

---

## Scope Boundaries

- No down/rollback migrations and no autogenerate-from-models (stay forward-only; there is no ORM to diff against).
- No automatic migration/bridging of pre-`refinery` `user_version = 1` DBs — a one-time manual reset instead.
- No reshaping of the provisional `sessions`/`turns` schema *content* — that is the separate session milestone; this work is the migration *mechanism* and failure policy only.
- No changes to the JSONL transcript truth or its format — only the SQLite index is affected.
- No migration-authoring CLI (`alembic revision`-style scaffolding).
- Keychain/secret storage is unaffected — no key material lives in the DB.

---

## Key Decisions

- **Adopt `refinery` (Approach D)** over keeping the hand-rolled runner or a lighter crate (`rusqlite_migration`): chosen for the fullest Alembic-style per-version-script ergonomics and checksum-enforced immutability, accepting that version tracking moves from `user_version` to `refinery`'s own history table.
- **Fail-closed on all store errors** over graceful-degrade: chosen so a broken DB is loud rather than silently reducing persistence; accepts that a shipped migration bug blocks all users, which raises the bar on migration correctness.
- **Accept a one-time manual reset for existing v1 DBs:** chosen because the installed base is ~zero at v0.1.3 and the DB rebuilds from JSONL, making a bridging/baseline step not worth building.
- **Stay forward-only despite adopting a rollback-capable tool:** consistent with the "rebuildable index, forward-fix" philosophy in `AGENTS.md`.

---

## Dependencies / Assumptions

- `refinery` must support the in-use `rusqlite 0.32` (bundled) without forcing a conflicting rusqlite version or a dual-version graph — assumption, verify in planning.
- `refinery`'s rusqlite runner does not by itself guarantee the concurrent multi-process boot safety the current runner provides; a busy-timeout/retry wrapper is assumed still required (R10).
- The JSONL transcript remains the source of truth and the SQLite index stays rebuildable, so a reset loses no durable user data.
- Installed base at v0.1.3 is effectively only dogfood DBs (including the maintainer's `~/.kqode/kqode.db`), so the one-time reset has negligible blast radius.

---

## Outstanding Questions

### Resolve Before Planning

- None — all product decisions are resolved.

### Deferred to Planning

- [Affects R1][Needs research] Does `refinery` support `rusqlite 0.32` (bundled), or does adoption force a rusqlite version change / dual-version graph?
- [Affects R11][Needs research] Does `refinery` natively detect "DB ahead of binary" (applied migrations the binary doesn't embed), or must we add an explicit guard to preserve `NewerSchema` behavior?
- [Affects R10][Technical] What is the exact concurrency wrapper around `refinery`'s runner (busy-timeout + retry / `BEGIN IMMEDIATE` equivalent) that preserves safe concurrent workspace boot under fail-closed?
- [Affects R7][Technical] What is the concrete mechanism for surfacing the fatal error to the TUI (an error notification vs. a ready-with-error payload vs. a process-exit diagnostic), given the TUI currently waits on `kqode.backend.ready`?
- [Affects R1, R9][Technical] Is `user_version` fully retired, or read once to detect a pre-`refinery` DB and produce a clearer reset message?
