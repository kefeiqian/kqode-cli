---
title: "feat: Per-Version refinery Migrations with a Fail-Closed Store"
type: feat
status: active
date: 2026-07-07
origin: docs/brainstorms/2026-07-06-db-migrations-refinery-and-fail-closed-store-requirements.md
deepened: 2026-07-07
---

# feat: Per-Version refinery Migrations with a Fail-Closed Store

## Summary

Replace the hand-rolled `user_version`/`STEPS` migration runner (`src/store/migrations.rs`) with the `refinery` crate, so each schema version becomes its own compile-time-embedded `V{n}__*.sql` script, and make the `~/.kqode/kqode.db` store a **hard startup dependency**: any open/migrate failure blocks the backend from emitting `kqode.backend.ready` and from entering the request loop, instead of degrading to session-only. The fatal error is surfaced actionably (via backend stderr + a TUI display path), the store's `Option<Store>` threading is removed in favour of a composition-root `&Store`, and pre-`refinery` databases get a one-time manual reset.

---

## Problem Frame

Schema migrations today are inlined as `&'static str` constants in one file, which will not scale as the provisional `sessions`/`turns` spine is reshaped. Separately, the store is non-fatal by design — `Store::open_or_bootstrap().ok()` in `src/backend/mod.rs` swallows any failure and the backend still reports ready, so a migration bug, a newer-than-known schema, or a corrupt index all silently reduce persistence. The full motivation lives in the origin requirements doc (see Sources & References).

---

## Requirements

**Migration tooling and layout**
- R1. Adopt `refinery` as the migration tool for `~/.kqode/kqode.db`, replacing the hand-rolled `STEPS`/`user_version` runner.
- R2. Each schema version is its own per-version `.sql` script embedded into the binary at compile time (no runtime disk reads).
- R3. Migrations stay forward-only and additive-only; no down/rollback migrations authored.
- R4. Rely on `refinery` checksum validation to detect an edited already-applied migration.

**Startup sequencing and fatal policy**
- R5. Migration completes before `kqode.backend.ready` and before any request is handled.
- R6. Any open/migrate failure is fatal: no ready signal, no request loop ("no working DB = no start").
- R7. On a fatal store failure, an actionable error names the DB path and the remedy; the user is never left hard-blocked with no path forward.
- R8. The database is never auto-deleted on any failure.

**Compatibility, adoption, robustness**
- R9. Pre-`refinery` DBs (`user_version = 1`) get a one-time manual reset; the fatal error instructs the user to delete `~/.kqode/kqode.db` and restart. Documented in release notes.
- R10. Concurrent workspace boots must not hard-fail from a transient `SQLITE_BUSY`/locked condition under the new fatal policy.
- R11. A DB whose applied migrations are ahead of what this binary embeds must cause the backend to refuse to start (downgrade protection).

**Code and documentation impact**
- R12. Remove the `Option<Store>` threading; treat the store as a hard `&Store` dependency across the backend.
- R13. Update `AGENTS.md` and the `src/store` rustdoc to reflect fail-closed; keep the "never auto-deleted" and "rebuildable index over JSONL truth" statements.

**Origin actors:** A1 (User), A2 (Rust backend init `run_stdio`), A3 (concurrent workspace instances), A4 (`refinery` runner + embedded scripts)
**Origin flows:** F1 (boot → migrate → ready), F2 (store failure → fail closed), F3 (pre-`refinery` v1 DB → one-time reset)
**Origin acceptance examples:** AE1 (covers R5, R6), AE2 (covers R6, R7, R8), AE3 (covers R9), AE4 (covers R10), AE5 (covers R11)

---

## Scope Boundaries

- No down/rollback migrations and no autogenerate-from-models (forward-only; no ORM).
- No automatic bridging/baseline of pre-`refinery` `user_version = 1` DBs — a one-time manual reset instead.
- No reshaping of the provisional `sessions`/`turns` schema *content* — this is the migration *mechanism* + failure policy only.
- No changes to the JSONL transcript truth or its format.
- No migration-authoring CLI (`refinery`/`alembic`-style scaffolding).
- Keychain/secret storage is unaffected — no key material lives in the DB.

### Deferred to Follow-Up Work

- Capturing new `docs/solutions/` learnings (DB-as-hard-dependency reversal, `refinery` adoption rationale, concurrent-boot handling): a `/ce-compound` pass after this lands; would establish a `tooling-decisions/` category that does not exist yet.

---

## Context & Research

### Relevant Code and Patterns

- `src/store/migrations.rs` — current runner: `STEPS: &[Step { version, sql: &'static str }]`, `LATEST_USER_VERSION = 1`, `migrate()` → `Result<(), StoreError>`, `apply_step()` with `BEGIN IMMEDIATE` + double-checked locking. `STEP_1_INITIAL_SCHEMA` holds the V1 DDL (`provider_settings`, `active_selection`, `sessions`, `turns`).
- `src/store/mod.rs` — `Store::open_or_bootstrap[_at]`, `open_connection` (busy_timeout + `synchronous=NORMAL`), `ensure_wal` (one-time WAL conversion with `SQLITE_BUSY` retry), `sanity_check` (reads `active_selection`), `StoreError` (6 variants), `#[derive(Clone)] Store` (holds only a `PathBuf`). **No env override for the DB path** — `src/paths.rs::db_path()` resolves `~/.kqode/kqode.db`, tests inject via `Store::open_or_bootstrap_at(path)`, and `run_stdio` calls the no-arg `open_or_bootstrap()` with **no** test-injection seam today (`KQODE_DB_PATH` was deliberately removed — do not reintroduce env vars).
- `src/store/tests.rs` — `tempfile`-backed DB, `EXPECTED_TABLES`, idempotent-reopen and concurrent-boot thread tests.
- `src/backend/mod.rs` — `run_stdio`: `Store::open_or_bootstrap().ok()` (L62) → `Connection::stdio()` → `announce_ready` (L64) → `run_loop(connection, store.as_ref(), …)`. `BackendError` enum. `announce_ready` sends `BACKEND_READY_METHOD`.
- `Option<Store>` / `Option<&Store>` surface (R12): synchronous handlers in `src/backend/{mod,message,providers,resolve}.rs` and `src/login.rs::resolve_base_url` take `Option<&Store>`; the async worker-thread handlers `handle_provider_set_key`/`handle_provider_models` (`src/backend/login.rs:45/90`) `store.cloned()` and move an **owned** `Option<Store>` into `std::thread::spawn`, so `src/login.rs::set_provider_key`/`list_models` take an **owned** `Option<Store>` (a borrow can't cross the `'static` thread boundary). `Store: Clone` is what enables this.
- **`persistence_available` behavioral surface** (a live consequence of `Option<Store>`): produced as `persistence_available: store.is_some()` (`src/backend/providers.rs:50`), carried on the wire (`src/protocol/providers.rs:79`, serialized `persistenceAvailable`), and branched-on in the TUI (`tui/src/contracts/backend/providerMessages.ts:97`; `tui/src/components/LoginSurface/index.tsx:70` renders `PersistenceDegradedMessage` via `useLoginBackend.ts:45`). The store-absent paths — `src/login.rs:76` `None => persist_session_only` (`src/login/selection.rs:53`) and the `!persistence_available` key-source branch (`src/backend/providers.rs:121`) — are reachable **only** when the store is absent.
- `LATEST_USER_VERSION` (`src/store/migrations.rs:19`, re-exported `src/store/mod.rs:23`) has **no consumers outside the store module and its tests** (`src/store/tests.rs` asserts it ~7×, incl. a `pragma_update(user_version, LATEST+1)` NewerSchema simulation at `:128`).
- `main.rs` — already prints `kqode failed: {error}` to stderr and returns `ExitCode::FAILURE` when `run_stdio` returns `Err`.
- TUI startup: `tui/src/backend/process/backendProcess.ts` (spawns backend, exposes `stderr` pipe, `onExit`), `tui/src/backend/client/backendReadiness.ts` (`waitForBackendReady` — resolves on ready, rejects on timeout/close/error with a *generic* message), `tui/src/backend/runtime/backendRuntime.ts` (`startBackendRuntime` — start-failure `.catch()` currently disposes and clears the hint, i.e. **degrades silently**).

### Institutional Learnings

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md` — a session-scoped dependency should be created once at the composition root and injected as a narrow, already-created handle, never threaded/owned by inner layers. Direct justification for R12 (create `Store` once in `run_stdio`, inject `&Store`). Also documents that the TUI's start-failure path degrades silently and clears the loading hint — so fail-closed must define the cross-boundary UX or it reproduces the old degrade at the TUI layer (U5).
- `docs/solutions/workflow-issues/recovering-from-concurrent-agent-session-edits.md` — this branch has concurrent agent/IDE committers; a wide multi-file sweep (R12) should be landed in a verified-quiet window, re-reading files fresh and gating on `cargo build`/`cargo test`/`cargo clippy`. (Execution guidance for `ce-work`.)
- No prior `docs/solutions/` coverage of SQLite/migrations/DB-concurrency exists — this is greenfield institutional territory.

### External References

Verified against crates.io on 2026-07-07:
- **`refinery 0.9.2`** (latest, published 2026-06-10) exposes `rusqlite` and `rusqlite-bundled` features. **`refinery-core 0.9.2` declares `rusqlite = ">=0.23, <=0.39"`** — our `rusqlite 0.32.1` is inside that range, so adoption resolves to the **same** `rusqlite 0.32` / `libsqlite3-sys 0.30` already in the lockfile (no duplicate `links = "sqlite3"` collision, no forced bump).
- `refinery` tracks applied migrations in its own `refinery_schema_history` table (version, name, applied_on, checksum) — **not** SQLite `user_version`.
- `set_abort_divergent(bool)` (checksum/divergent-migration abort) and `set_abort_missing(bool)` (DB-ahead / missing-migration abort) gate R4 and R11; both default `true` in recent releases but will be set **explicitly** for robustness.
- `embed_migrations!("…")` embeds `V{version}__{name}.sql` files at compile time; runner API is `runner().run(&mut conn)` returning `refinery::Report`/`refinery::Error`.
- `refinery` uses a per-migration **DEFERRED** transaction and does **not** set `busy_timeout` or retry `SQLITE_BUSY` — the caller must own WAL/busy_timeout and serialize concurrent first-boot (informs R10 / U2).
- `refinery`'s `rusqlite` feature transitively enables `config` → `toml` in 0.9.2; refinery-core also pulls `regex`, `walkdir`, `url`, `time`, `siphasher`, `thiserror`, `async-trait`, `log`.

---

## Key Technical Decisions

- **Use `refinery 0.9.2` with the `rusqlite` feature; let the existing `rusqlite` dependency supply `bundled`.** Compatibility is verified (refinery-core 0.9.2 `rusqlite = ">=0.23, <=0.39"` includes 0.32), so one SQLite/`libsqlite3-sys` in the graph. Chosen over `rusqlite-bundled` to avoid a second bundled path.
- **Set `set_abort_missing(true)` and `set_abort_divergent(true)` explicitly** — pins DB-ahead downgrade protection (R11) and checksum immutability (R4) regardless of default drift across `refinery` versions.
- **Version tracking moves to `refinery_schema_history`; retire `LATEST_USER_VERSION`.** `refinery` never writes `user_version` (it stays `0`). `LATEST_USER_VERSION` has no external consumers, so it is **removed** (not kept) — a public constant that no longer reflects real version state is a trap. `user_version` is read only once, to detect a pre-`refinery` DB (R9).
- **Serialize concurrent first-boot with an OS advisory file-lock; keep WAL + `busy_timeout`.** `refinery` owns its migration transaction as `DEFERRED` and does not retry `SQLITE_BUSY`; today's `BEGIN IMMEDIATE` gate does **not** translate (a same-connection `BEGIN IMMEDIATE` is a nested-transaction error; an external one just makes refinery's write `SQLITE_BUSY`), and a `DEFERRED` read→write upgrade returns `SQLITE_BUSY` *immediately* rather than invoking the busy handler — so `busy_timeout` alone cannot serialize racing booters. A file-lock (auto-released on process death, on a lock file beside the DB) is preferred over a retry, whose "table already exists" classification collides with the legacy/dirty signal (U2/U4 ordering).
- **Fail closed by propagating `StoreError` before `announce_ready`; never auto-delete.** Add a `BackendError::Store(StoreError)` variant.
- **Map `BackendError::Store` to a distinct process exit code and a stable machine-greppable stderr sentinel line.** The current flat `ExitCode::FAILURE` (with `run()` stringifying the error) cannot distinguish a store-fatal from a bad-arg, transport failure, or panic backtrace — so the TUI would otherwise surface a panic trace as if it were the "delete the DB" remedy. The backend owns the full human-readable actionable message; the TUI treats it as **opaque display text** (does not parse it). Promote to a `kqode.backend.fatal` notification only if a *structured* reason/DB-path is later needed (documented trigger in Alternatives).
- **Variant-branched fatal remedy (R7 — data-loss guard).** A single "delete the DB" string is dangerous for the DB-ahead case (R11/AE5): deleting a newer DB to boot an older binary destroys the more-recent index. So the remedy branches — DB-ahead/divergent → "run a newer KQode; do **not** delete"; corrupt / legacy-v1 / dirty-partial → "delete `~/.kqode/kqode.db` **and its `-wal`/`-shm` sidecars** and restart (rebuilds from JSONL)". The message names the resolved path and requires the process to have exited (Windows holds a delete-blocking handle otherwise).
- **`sanity_check` asserts the schema version and treats `SQLITE_BUSY` as transient.** Today it only proves `active_selection` is queryable (which a legacy-v1 DB also satisfies); it will additionally confirm `refinery`'s applied max version equals the embedded latest, and retry (like `ensure_wal`) on a transient lock rather than hard-failing a healthy DB.
- **Each `V*.sql` migration must be fully transactional** — no `VACUUM`, no `journal_mode`/`foreign_keys` toggles, no implicit-commit statements — because `refinery` wraps each migration in one transaction and a mid-script implicit commit leaves a partial schema with no history row (authoring constraint in U1/U7 + Scope).
- **Composition-root ownership of `Store`** — created once in `run_stdio`, injected downward. Synchronous handlers take `&Store`; the two async worker-thread handlers keep an **owned** `Store` moved into the thread via `store.clone()`. `Store: Clone` (a `PathBuf`) is load-bearing here and must not be "fixed" into `Arc<Store>` or a cross-thread borrow.
- **Resolve `persistence_available` as part of R12 (U8).** With the store mandatory, `store.is_some()` is always true, so the wire field, `PersistenceDegradedMessage`, `persist_session_only`, and the `!persistence_available` branch become dead. Recommended: remove the field + UI + false-path tests as a coordinated Rust↔TS lockstep change; the alternative is hardcoding it `true` and documenting the TUI branch as intentionally dead.

---

## Open Questions

### Resolved During Planning

- refinery ↔ `rusqlite 0.32` compatibility: **resolved** — `refinery 0.9.2`, range `>=0.23, <=0.39`.
- DB-ahead detection (R11): **resolved** — `set_abort_missing(true)`.
- Concurrency mechanism (R10): **resolved** — OS advisory file-lock preferred over a bounded retry (retry collides with the legacy "table exists" signal); `BEGIN IMMEDIATE` does not translate to refinery.
- Fatal-error surfacing (R7): **resolved** — actionable, variant-branched `StoreError` + a distinct exit code + an opaque stderr line surfaced by the TUI.
- Retire vs. keep `user_version`/`LATEST_USER_VERSION`: **resolved** — read `user_version` once for legacy detection; remove `LATEST_USER_VERSION`.
- `persistence_available` under fail-closed: **resolved (recommended)** — remove the now-unreachable field + UI + false-path tests (lockstep, U8); hardcode-true is the documented alternative.
- Test injection for fail-closed: **resolved** — a code seam (internal `run_stdio_with(...)` + `Store::open_or_bootstrap_at`), **not** an env var (`KQODE_DB_PATH` was deliberately removed).

### Deferred to Implementation

- **Verify-before-U1 gate** (against docs.rs/refinery source, MEDIUM-confidence facts): exact `abort_missing` vs `abort_divergent` semantics + `Error::Kind` variant names; that DDL + history-insert commit as one atomic transaction; per-migration (not grouped) default; the exact history-table name `refinery_schema_history`. Block U2's mechanism choice on the transaction-behavior confirmation.
- Exact `embed_migrations!` path/dir (crate-root `migrations/` vs `src/store/migrations/`).
- Whether `refinery`'s `rusqlite` feature pulling `config`+`toml` is trimmed or accepted.
- Cross-platform advisory-lock semantics for the file-lock (Windows ships an npm binary; advisory vs mandatory differs); behavior on a lock-acquire error on exotic FS (fail-closed vs proceed).
- Exact distinct exit-code value for `BackendError::Store` and the stderr sentinel prefix string.
- Precise TUI atoms/modules for surfacing the fatal message (per `tui/AGENTS.md`: focused modules ≤200 lines, Jotai atoms, cursor caveat if layout changes).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
    A[run_stdio start] --> B[open_or_bootstrap:\nopen + WAL + busy_timeout]
    B --> C{serialize first-boot\n(lock / retry)}
    C --> D[refinery run\nabort_missing + abort_divergent]
    D -->|Ok| E[sanity read]
    E --> F[announce_ready\n+ request loop]
    B -->|Err| X
    C -->|Err| X
    D -->|Err: divergent / missing /\nlegacy v1 / sql| Y[actionable StoreError\npath + remedy]
    Y --> X[run_stdio returns Err\nNO ready, NO loop, DB not deleted]
    X --> Z[main.rs: stderr + distinct store exit code]
    Z --> T[TUI buffers stderr,\nshows fatal instead of silent degrade]
```

---

## Implementation Units

### U1. Adopt refinery and embed the V1 migration; replace the runner internals

**Goal:** Bring in `refinery 0.9.2`, move the current V1 DDL into an embedded `.sql` script, and rewrite `src/store/migrations.rs` to run `refinery` (with `set_abort_missing(true)` + `set_abort_divergent(true)`) while keeping the `migrate()` → `Result<(), StoreError>` boundary and the WAL/busy_timeout setup.

**Requirements:** R1, R2, R3, R4, R11 (produces the DB-ahead error; U3 makes it block startup)

**Dependencies:** None

**Files:**
- Modify: `Cargo.toml` (add `refinery = { version = "0.9.2", features = ["rusqlite"] }`)
- Create: `migrations/V1__initial_schema.sql` (verbatim current `provider_settings`, `active_selection`, `sessions`, `turns` DDL)
- Modify: `src/store/migrations.rs` (replace `STEPS`/`apply_step`/`user_version` with `embed_migrations!` + a configured `runner()`; map `refinery::Error` → `StoreError`)
- Modify: `src/store/mod.rs` (**remove** the `LATEST_USER_VERSION` re-export; update `sanity_check` per below)
- Test: `src/store/tests.rs` (substantial rewrite — see Test scenarios)

**Approach:**
- **Pre-flight verify gate** (see Open Questions → Deferred): before coding, confirm against docs.rs/source the `abort_missing`/`abort_divergent` semantics + `Error::Kind` variant names, that DDL + history-insert commit atomically, per-migration (not grouped) default, and the exact history-table name `refinery_schema_history`.
- `embed_migrations!` compiles `migrations/` into the binary; `runner()` set with `set_abort_missing(true)` + `set_abort_divergent(true)`, run on the bootstrap connection. Map missing/divergent/ahead → `StoreError::NewerSchema` (or a dedicated variant); SQL/exec failures → `StoreError::Migrate`.
- **Remove `LATEST_USER_VERSION`** — refinery owns version state (leaves `user_version = 0`); the constant has no external consumers and would misrepresent reality.
- **`sanity_check` change:** additionally assert refinery's applied max version equals the embedded latest (belt-and-suspenders that refinery didn't silently no-op), keep the `active_selection` probe, and treat a transient `SQLITE_BUSY` on the sanity read as retryable (like `ensure_wal`), not fatal.
- **Migration-authoring constraint:** each `V*.sql` must be fully transactional — no `VACUUM`, no `journal_mode`/`foreign_keys` toggles, no implicit-commit statements.
- `V1__initial_schema.sql` must exactly equal today's `STEP_1_INITIAL_SCHEMA`.

**Patterns to follow:** existing `src/store/mod.rs` connection/pragma helpers; `EXPECTED_TABLES` assertion style in `src/store/tests.rs`.

**Test scenarios:**
- Covers AE1 (schema half). Happy path: fresh DB → the four expected tables exist and `refinery_schema_history` records V1 exactly once.
- Happy path: reopening a migrated DB is idempotent (no error, no re-apply).
- Error path: an edited already-applied migration (changed checksum) → divergent `StoreError` (not a panic). Add a **pinned V1 checksum/golden test** so an accidental edit to a shipped migration fails at *test* time, not only at a user's runtime.
- Covers AE5. Error path: seed a `refinery_schema_history` row **ahead** of the embedded set → `set_abort_missing` refusal surfaces as `StoreError` (not a panic).
- Full-chain: migrating an empty DB applies the entire embedded chain to the expected final schema (guards multi-version runs).
- **Test rewrites (these break to *compile*, not just fail):** delete the `apply_step` rollback test; replace the ~7 `user_version == LATEST_USER_VERSION` assertions with `refinery_schema_history` assertions; adjust `EXPECTED_TABLES` for `refinery_schema_history`; rebuild `a_newer_schema_degrades...` to simulate DB-ahead via a seeded history row and rename it to reflect **refuse-to-start** (not degrade).

**Verification:** store tests green; fresh bootstrap yields the prior table set plus `refinery_schema_history`; the pinned-checksum test fails if `V1__initial_schema.sql` is edited.

---

### U2. Harden concurrent first-boot migration

**Goal:** Guarantee two concurrent boots against the same fresh DB do not hard-fail: exactly one applies migrations, the other waits and observes the applied history.

**Requirements:** R10

**Dependencies:** U1, U4 (legacy/dirty detection must run before refinery so "table exists" never reaches a retry classifier)

**Files:**
- Modify: `src/store/mod.rs` / `src/store/migrations.rs` (serialization around open→refinery→sanity)
- Modify: `Cargo.toml` (only if an advisory-lock crate — e.g. `fs2`/`fd-lock` — is chosen)
- Test: `src/store/tests.rs` (+ a multi-process test harness)

**Approach:**
- Keep WAL + `busy_timeout`. **Preferred mechanism: an OS advisory file-lock** (auto-released on process death) on a lock file *beside* the DB (never the DB file, never deleted on release), held across open→refinery→sanity.
- **Why not the obvious alternatives:** a `BEGIN IMMEDIATE` gate does not translate — refinery owns its `DEFERRED` transaction on the passed connection, so a same-connection `BEGIN IMMEDIATE` is a nested-transaction error and an external one just makes refinery's write `SQLITE_BUSY`; and a `DEFERRED` read→write upgrade returns `SQLITE_BUSY` *immediately* (bypassing the busy handler), so `busy_timeout` alone can't serialize. A bounded retry is a weaker fallback and must restrict itself to a genuinely-transient `SQLITE_BUSY` on the history *read* — it must **not** treat "table already exists" as transient (that's the legacy/dirty signal U4 owns).
- **Bound the wait well under the TUI startup timeout** (`DEFAULT_STARTUP_TIMEOUT_MS = 10_000`, `tui/src/constants/backend.ts`), since this wait now precedes `announce_ready`; make the bound observable/testable.
- Note Windows advisory-vs-mandatory lock semantics (the repo ships an npm Windows binary); decide fail-closed vs proceed on a lock-acquire error.

**Patterns to follow:** the existing `ensure_wal` retry/backoff in `src/store/mod.rs`.

**Test scenarios:**
- Covers AE4. Integration (**multi-process**, not in-process threads — advisory locks are per-process, so threads can both false-pass and false-fail the lock): spawn real backend subprocesses against one fresh DB path (Windows + Unix) → assert `refinery_schema_history` has **exactly one** V1 row with a single `applied_on`, each table exists exactly once, and no process surfaces "table already exists" as fatal.
- Edge case: a second boot after full migration → no-op, no error.

**Verification:** the multi-process concurrent-boot test is green repeatedly; the serialization wait is bounded and under the startup-timeout budget.

---

### U3. Fail closed at backend init

**Goal:** Make the store a hard dependency in `run_stdio`: on any `StoreError`, do not emit `kqode.backend.ready`, do not enter the request loop, and return the error; never auto-delete the DB. Preserve migrate-before-ready ordering.

**Requirements:** R5, R6, R8

**Dependencies:** U1

**Files:**
- Modify: `src/backend/mod.rs` (extract an internal `run_stdio_with(store_result, …)` seam that the public `run_stdio` delegates to; propagate `StoreError` before `announce_ready`; add `BackendError::Store(StoreError)`)
- Modify: `main.rs` (map `BackendError::Store` to a **distinct exit code**; stop flattening the error to `String` so the variant/code survives)

**Approach:**
- `run_stdio` resolves the store and, on any `StoreError`, returns `Err(BackendError::Store(..))` **before** `Connection::stdio()`/`announce_ready`, so ordering (R5) holds and no ready/loop happens (R6).
- **Test seam is code, not an env var** (no `KQODE_DB_PATH` — deliberately removed): an internal `run_stdio_with(...)` accepting an injected store/result (or a pre-seeded temp DB via `open_or_bootstrap_at`) makes fail-closed testable; the public entry delegates with the real resolver.
- Map `BackendError::Store` to a distinct process exit code in `main.rs` (read later via the TUI's existing `onExit.code`), so a store-fatal is distinguishable from a bad-arg/transport/panic. Never touch/delete the DB (R8).

**Patterns to follow:** existing `BackendError` enum + `announce_ready` structure; `main.rs`'s existing `ExitCode` handling.

**Test scenarios:**
- Covers AE1 (ordering). Happy path: a healthy DB → store opens, then ready is emitted.
- Covers AE2 (backend side). Error path: inject a fatal `StoreError` via the seam → `run_stdio` returns `Err`, **no** `kqode.backend.ready` on the captured stdout, request loop not entered, DB untouched, and the process exits with the store-specific code.

**Verification:** the injected-failure test asserts no ready notification + the distinct exit code; a healthy DB path is unchanged.

---

### U4. Actionable fatal error message + legacy-v1 reset detection

**Goal:** Make `StoreError` `Display` actionable (name the DB path + remedy), and detect a pre-`refinery` DB to emit a specific "delete and restart" message.

**Requirements:** R7, R9, R11 (safe remedy)

**Dependencies:** U1, U3

**Files:**
- Modify: `src/store/mod.rs` (`StoreError` `Display` — **variant-branched**, carries the resolved DB path; emits a stable machine-greppable sentinel prefix)
- Modify: `src/store/migrations.rs` (pre-refinery detection, runs **before** refinery)
- Test: `src/store/tests.rs`

**Approach:**
- **Variant-branched remedy (data-loss guard):** DB-ahead/divergent → "you are running an older KQode than this database; upgrade the binary — do **not** delete." Corrupt / legacy-v1 / dirty-partial → "delete `~/.kqode/kqode.db` **and its `-wal`/`-shm` sidecars** and restart (rebuilds from JSONL)." The old `NewerSchema` "running session-only" text is removed.
- **Broaden legacy detection:** the signal is "any expected V1 table exists AND no/empty `refinery_schema_history`", not solely `user_version = 1` (catches dirty/hand-created DBs that would otherwise hit a raw "table exists"). Pin the `refinery_schema_history` name; add a test that refinery actually uses it.
- Emit a stable sentinel prefix on the actionable stderr line (consumed opaquely by U5). The remedy assumes the process has exited (Windows holds a delete-blocking handle otherwise — see U3/U5).

**Patterns to follow:** existing `StoreError` `Display` impl in `src/store/mod.rs`.

**Test scenarios:**
- Covers AE3. Error path: seed `user_version = 1` + legacy tables, no history → legacy-reset error whose message names the path + the delete-with-sidecars instruction; after deletion a fresh bootstrap succeeds.
- **Must-have (data-loss guard):** the **DB-ahead** message contains **no** "delete" instruction (asserts the R11 safe remedy).
- Edge case: expected table present but `user_version = 0` and no history (dirty/hand-created) → still the reset message, not a raw "table exists".
- Error path: a generic migrate failure's message names the DB path (not a bare SQL string).

**Verification:** message-content assertions per variant (path present; delete only where safe; sidecars named); fresh re-bootstrap is green.

---

### U5. Surface the fatal error in the TUI

**Goal:** Replace the TUI's silent start-failure degrade with a visible fatal error carrying the backend's actionable message, distinguishing "backend died on a fatal store error" from "still loading".

**Requirements:** R7 (TUI side)

**Dependencies:** U3, U4

**Files:**
- Modify: `tui/src/backend/process/backendProcess.ts` (drain + buffer the backend `stderr` **at spawn time** into a capped buffer on `LaunchedBackend`; expose it)
- Modify: `tui/src/backend/client/backendReadiness.ts` (change `onFatal` to carry `{ code, signal }` + buffered stderr; **await process close / stderr-end** before assembling the fatal message, not just `connection.onClose`)
- Modify: `tui/src/backend/runtime/backendRuntime.ts` (surface the fatal message as a visible error entry, distinguishing store-fatal from still-loading)
- Modify/Create: a small Jotai error/status atom if needed (per `tui/AGENTS.md`, prefer atoms over prop drilling)
- Test: `tui/src/backend/**/__tests__/` (mirror `backendBuild.test.ts`'s capped-buffer stderr-capture pattern)

**Approach:**
- **Drain stderr at spawn** (not on failure) — an unread OS pipe is a backpressure/loss hazard and early fatal bytes would be lost. Mirror `backendBuild.ts`'s capped-buffer accumulator keyed off process `close`.
- **Attribute via the store-specific exit code + the sentinel prefix** (from U3/U4): a matching exit → "actionable store fatal", show the backend's message verbatim as **opaque display text** (the TUI does not parse its structure); a non-matching abnormal exit (e.g., a panic backtrace) → a generic crash message, **not** the delete remedy.
- Await process close/stderr-end before rejecting (the current settle-on-`connection.onClose` can fire before stderr flushes, truncating the message).

**Execution note:** honor `tui/AGENTS.md` — keep modules ≤200 lines and, if any layout row is added for an error surface, verify the composer cursor still lands on the active text row.

**Patterns to follow:** `tui/src/backend/process/backendBuild.ts` stderr accumulator; `startBackendRuntime` existing hook wiring; the existing `onExit`/`BackendExit { code, signal }` seam.

**Test scenarios:**
- Covers AE2/AE3 (user-visible side). Integration: backend exits with the store-fatal code + sentinel stderr before ready → the TUI shows that actionable message (path/remedy), not the generic transport error and not a silent degrade.
- Edge case: normal ready clears the loading hint, no error shown.
- Error path: abnormal exit **without** the sentinel (simulated panic) → generic crash message, not the delete remedy.
- Edge case: exit with empty stderr → a sensible generic fatal (no crash, no truncated read).

**Verification:** `cargo xtask tui-typecheck` and `cargo xtask tui-test` pass; attribution tests distinguish store-fatal from crash.

---

### U6. Remove `Option<Store>` — hard `&Store` dependency

**Goal:** With the store guaranteed present (U3), replace every `Option<Store>`/`Option<&Store>` with `Store`/`&Store`, deleting `.as_ref()`/`.cloned()`/`None`-degrade branches. Store is created once at the composition root and injected.

**Requirements:** R12

**Dependencies:** U3; land **after** U1+U2 are green and **after** U8 (which resolves `persistence_available`); own quiet window (concurrent-branch hazard)

**Files:**
- Modify: `src/backend/mod.rs` (`run_loop`, dispatch, `handle_selection_set`, `handle_provider_clear_key`)
- Modify: `src/backend/message.rs`, `src/backend/login.rs`, `src/backend/providers.rs`, `src/backend/resolve.rs`
- Modify: `src/login.rs` (`set_provider_key`, `list_models`, `resolve_base_url`), `src/login/selection.rs` (drop `persist_session_only`)
- Test: existing `src/backend/**/tests.rs`, `src/login/tests.rs`

**Approach:**
- **Owned-vs-borrow split, not a blanket `&Store`:** the synchronous surface (`provider_list`, `active_selection`, `set_active_selection`, `clear_provider_key`, `resolve_submit_config`, `handle_message_submit`, `resolve_base_url`) takes `&Store`; the two deferred-worker handlers (`handle_provider_set_key`/`handle_provider_models`) keep an **owned** `Store` moved into the thread via `store.clone()`, so `set_provider_key`/`list_models` take an owned `Store`. `Store: Clone` (a `PathBuf`) is load-bearing — do **not** "fix" it into `Arc<Store>` or a cross-thread borrow.
- Delete the store-absent branches now dead once the store is mandatory: `None => persist_session_only` (`src/login.rs:76`), `persist_session_only` itself (`src/login/selection.rs:53`) + its three tests, and the `!persistence_available` key-source branch (`src/backend/providers.rs:121`) — coordinate with U8.
- Keep genuine "no row yet" `Option` query results (missing data ≠ missing store). Composition-root: `run_stdio` owns the single `Store`, injects it.

**Execution note:** wide sweep on a shared, multi-session branch — verified-quiet-window landing, re-read files fresh before editing, gate on `cargo build`/`cargo test`/`cargo clippy` (per `docs/solutions/workflow-issues/recovering-from-concurrent-agent-session-edits.md`).

**Patterns to follow:** the injected-seam pattern from the backend-lifecycle learning; existing test doubles in `src/backend/resolve/tests.rs` / `providers/tests.rs`.

**Test scenarios:**
- Happy path: provider list / active selection / submit-config resolution behave identically with a non-optional store.
- Integration: `/login` set-key and `/model` list-models paths still function (owned `Store` into the worker thread).
- Edge case: with the store mandatory there is no store-absent path; a present store with no active-selection row still returns "not configured" (missing row, not missing store).

**Verification:** `cargo build`, `cargo test --workspace`, and `cargo clippy --workspace --all-targets --all-features -- -D warnings` are green; `grep` finds no `Option<Store>`/`Option<&Store>` and no `persist_session_only`.

---

### U7. Documentation updates

**Goal:** Reflect the fail-closed policy in `AGENTS.md` and the store rustdoc, keep the durable invariants, and document the one-time reset for pre-`refinery` DBs.

**Requirements:** R9 (documentation), R13

**Dependencies:** U1–U6

**Files:**
- Modify: `AGENTS.md` (provider-config/store section: replace "degrades to `.env`-only chat / non-fatal" with the fail-closed statement; **remove the now-stale `KQODE_DB_PATH` mention** — it was deliberately removed; keep "never auto-deleted" and "rebuildable index over JSONL truth"; note the `user_version = 0` asymmetry — a *pre-`refinery`* binary run against a `refinery` DB reads `user_version = 0` as "fresh")
- Modify: `src/store/mod.rs`, `src/store/migrations.rs` (rustdoc: fail-closed, `refinery`/`refinery_schema_history`, forward-only recovery, and the fully-transactional-migration authoring constraint)
- Modify: release notes / `CHANGELOG` (one-time: delete `~/.kqode/kqode.db` **and its `-wal`/`-shm` files** once when upgrading past a pre-`refinery` build)

**Approach:** prose/doc only; align statements with the shipped behavior from U1–U6.

**Test scenarios:** Test expectation: none — documentation only.

**Verification:** `AGENTS.md` no longer claims the store is non-fatal; rustdoc builds (`cargo doc` optional); release note names the exact reset path.

---

### U8. Resolve `persistence_available` under fail-closed

**Goal:** Remove the now-unreachable "degraded persistence" surface so the `Option<Store>` removal (U6) doesn't leave a permanently-`true` wire field and dead TUI UI.

**Requirements:** R12 (completeness)

**Dependencies:** U3 (store mandatory); lands before/with U6

**Files:**
- Modify: `src/backend/providers.rs` (drop `persistence_available: store.is_some()` and the `!persistence_available` `key_source` branch)
- Modify: `src/protocol/providers.rs` (remove the `persistence_available` field + its default/serialization test)
- Modify: `tui/src/contracts/backend/providerMessages.ts` (remove `persistenceAvailable`)
- Modify: `tui/src/components/LoginSurface/index.tsx`, `useLoginBackend.ts` (remove the `PersistenceDegradedMessage` render + `loginPersistenceAvailableAtom`); remove `PersistenceDegradedMessage` if unused
- Modify/Delete tests: `src/backend/providers/tests.rs` (the `!persistence_available` test), `src/login/tests.rs` (`persist_session_only` tests — coordinated with U6), TUI `LoginSurface.test.tsx` false-path cases and the `persistenceAvailable` stubs across TUI tests

**Approach:**
- **Recommended: remove the field + UI + false-path tests** as a coordinated Rust↔TS lockstep change (honors the wire-protocol lockstep convention). Under fail-closed the "degraded persistence" state is unreachable, so the field would otherwise be a permanently-`true` lie and the UI dead code.
- **Alternative (documented):** keep the field hardcoded `true` and mark the TUI branch intentionally dead — smaller diff, but leaves a misleading field.

**Patterns to follow:** the wire-protocol lockstep (`src/protocol/*` ↔ `tui/src/contracts/backend/*`) per repo convention.

**Test scenarios:**
- Contract: the Rust `provider.list` result and the TS type match with the field gone (protocol lockstep preserved).
- Integration: TUI `LoginSurface` renders normally without the degraded message (stubs updated).
- Happy path: provider-list flow unaffected by the field's removal.

**Verification:** `cargo build`/`cargo test` + `cargo xtask tui-typecheck`/`tui-test` green; `grep` finds no `persistence_available`/`persistenceAvailable`.

---

## Testing Strategy

The high-risk integration outcomes span units and must not be lost between per-unit bullets:

- **Migrate-before-ready & fatal-blocks-startup** (U3): via the `run_stdio_with(...)` code seam — a healthy DB emits ready; an injected `StoreError` yields no ready, no loop, and the store-specific exit code.
- **Multi-process concurrent boot** (U2): real backend subprocesses on one fresh DB → exactly one V1 history row, tables once, no fatal "table exists" (per-process advisory locks make in-process threads an invalid test).
- **Legacy-v1 reset round trip** (U4): seed a pre-`refinery` DB → actionable reset message (path + `-wal`/`-shm` sidecars) → delete → clean bootstrap.
- **DB-ahead refusal** (U1/U4): seeded ahead history → refuse to start, message says *upgrade* (no delete).
- **Full-chain migration + pinned V1 checksum** (U1): empty→latest applies the whole chain; an edited shipped migration fails at test time.
- **Fatal attribution in the TUI** (U5): store-fatal code + sentinel → actionable message; panic without sentinel → generic crash message.

Rust gates: `cargo test --workspace`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo fmt --check`. TUI gates: `cargo xtask tui-typecheck`, `cargo xtask tui-test`.

---

## System-Wide Impact

- **Interaction graph:** `run_stdio` ordering (store → ready → loop) is the critical path; `main.rs` maps `BackendError::Store` to a distinct exit code; the TUI spawn/readiness path (`backendProcess` → `backendReadiness` → `backendRuntime`) reads that code + drained stderr.
- **Error propagation:** `StoreError` (variant-branched, actionable) → `BackendError::Store` → distinct exit code + sentinel stderr → TUI opaque display.
- **State lifecycle risks:** concurrent first-boot TOCTOU (U2); the real partial-apply risk is a **non-transactional statement** in a future migration (authoring constraint, U1), not the happy path; the DB is never auto-deleted (R8).
- **Startup-timeout budget:** open + migrate + first-boot lock-wait now **all precede** `announce_ready`, under the TUI's `DEFAULT_STARTUP_TIMEOUT_MS = 10_000`; U2 bounds the wait, and this budget must be revisited as the migration chain grows (else a slow/serialized boot surfaces as a misleading `Timeout`).
- **API surface parity — CORRECTION:** this is **not** protocol-neutral. U8 removes the `persistence_available` field (Rust `src/protocol/providers.rs` ↔ TS `providerMessages.ts`), a coordinated lockstep change; method/param *shape* is otherwise unchanged and no new method is added.
- **Stderr hygiene:** the running backend's stderr is currently undrained (only the *build* step's is); U5 drains it at spawn to avoid loss/backpressure. The debug log writes to a file (`~/.kqode/logs/...`), not stderr, so there is no stderr/debug-log interleaving.
- **Integration coverage:** see the Testing Strategy section — none of the cross-unit outcomes are fully proven by unit tests alone.
- **Unchanged invariants:** "rebuildable index over JSONL truth" and "never auto-deleted" are preserved; JSONL transcript, keychain, and provider-resolution semantics are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Concurrent first-boot TOCTOU hard-fails under fail-closed | U2 OS advisory file-lock (preferred) + WAL + `busy_timeout`; multi-process concurrent-boot test (AE4) |
| **DB-ahead "delete the DB" remedy destroys a newer index** | Variant-branched remedy (U4): DB-ahead says *upgrade the binary, don't delete*; test asserts no delete instruction on that path |
| A shipped migration bug hard-blocks **all** users (fail-closed blast radius) | Forward-only, `abort_divergent`, full-chain + pinned-checksum tests, actionable reset; DB rebuildable from JSONL |
| **No runtime escape hatch after `Option<Store>` removal** (npm binary) | Accepted; mitigated by rebuild-from-JSONL + actionable reset; consider a documented bypass flag rather than the removed *silent* degrade |
| **Partial migration from a non-transactional statement** in a future `V*.sql` | Fully-transactional authoring constraint (U1/U7); verify DDL+history atomicity; delete-remedy safety net |
| **Transient `SQLITE_BUSY` on the sanity/read turned fatal** under fail-closed | `sanity_check` treats BUSY as retryable (U1); file-lock serialization (U2) |
| **TUI mis-attributes a panic/crash as the "delete the DB" remedy** | Distinct store exit code + stderr sentinel; U5 shows a generic message without them |
| Startup work (migrate + lock-wait) exceeds the TUI 10 s ready timeout → misleading `Timeout` | U2 bounds the wait; revisit `DEFAULT_STARTUP_TIMEOUT_MS` as the chain grows |
| Windows advisory-lock semantics differ (npm Windows binary) | Called out in U2; decide fail-closed vs proceed on a lock-acquire error; multi-process test on Windows |
| `refinery`'s `rusqlite` feature couples `config`+`toml`; refinery-core adds `regex`/`walkdir`/`url`/`time`/etc. | Accepted cost of Approach D; revisit feature trimming if graph weight matters |
| Secondary `refinery` facts (abort defaults, error variants, tx atomicity) unverified externally | Verify-before-U1 gate; set `abort_missing`/`abort_divergent` explicitly |
| Wide `Option<Store>` sweep collides with concurrent branch committers | Quiet-window landing, re-read fresh, gate on cargo build/test/clippy (learnings doc) |
| `refinery` release moves past `rusqlite 0.32`'s range in future | Pin `refinery = "0.9.2"`; re-check the range before any bump |

---

## Alternative Approaches Considered

- **R7 surfacing via a dedicated `kqode.backend.fatal` JSON-RPC notification** (lockstep Rust `src/protocol` + TS `tui/src/contracts/backend`): rejected for this iteration — larger protocol surface and lockstep-mirror cost for a startup-only signal, when reusing the existing stderr + exit path (already implemented in `main.rs`) plus a TUI display is sufficient. Kept as the fallback if a structured status payload is later needed.
- **`rusqlite_migration` or keeping the hand-rolled runner** (lighter, same `user_version` model): not chosen — the origin brainstorm selected `refinery` (Approach D) for the fullest Alembic-style per-version-script ergonomics and checksum-enforced immutability, accepting the version-tracking change.
- **Flat `ExitCode::FAILURE` for all backend errors** (status quo): rejected — the TUI can't distinguish a store-fatal from a bad-arg/transport/panic, so it might surface a panic backtrace as the "delete the DB" remedy. A distinct store exit code + a stderr sentinel is used instead; promote to a `kqode.backend.fatal` notification only when a *structured* reason/DB-path is needed (the documented trigger to grow the protocol rather than parse stderr).

---

## Documentation / Operational Notes

- One-time upgrade note (release notes/CHANGELOG): users upgrading past a pre-`refinery` build must delete `~/.kqode/kqode.db` once; the backend prints this instruction on the fatal error, and the DB rebuilds from JSONL.
- After landing, run `/ce-compound` to capture the DB-as-hard-dependency reversal, `refinery` adoption rationale, and concurrent-boot handling as `docs/solutions/` learnings (establishing a `tooling-decisions/` category).

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-07-06-db-migrations-refinery-and-fail-closed-store-requirements.md`
- Related code: `src/store/migrations.rs`, `src/store/mod.rs`, `src/backend/mod.rs`, `src/login.rs`, `main.rs`, `tui/src/backend/client/backendReadiness.ts`, `tui/src/backend/process/backendProcess.ts`, `tui/src/backend/runtime/backendRuntime.ts`
- External: `refinery` crates.io (v0.9.2) and `refinery-core` 0.9.2 dependency manifest (`rusqlite = ">=0.23, <=0.39"`); `refinery` docs.rs (`Runner`, `set_abort_missing`, `set_abort_divergent`, `embed_migrations!`)
- Learnings: `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`, `docs/solutions/workflow-issues/recovering-from-concurrent-agent-session-edits.md`
