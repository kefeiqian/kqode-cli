---
title: Divergent migration history points to the safe reset, not a dead-end upgrade
date: 2026-07-11
category: database-issues
module: src/store
problem_type: database_issue
component: database
symptoms:
  - "The store fails closed on a refinery `DivergentVersion` error, so `kqode.backend.ready` never fires and KQode will not start"
  - "The `KQODE_STORE_FATAL` remedy told the user to upgrade to a binary that knows this migration history, which no forward binary can satisfy"
  - "Triggered by a checksum mismatch on an already-embedded migration (e.g. CRLF-to-LF line-ending drift on a shipped `.sql` file)"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - refinery
  - sqlite
  - migrations
  - store-recovery
  - crlf
  - checksum
  - fail-closed
---

# Divergent migration history points to the safe reset, not a dead-end upgrade

## Problem
The store's fatal-error classifier treated a refinery `DivergentVersion` (a
checksum mismatch on a migration this binary *already embeds*) as an
"upgrade-only" failure. Because the store is fail-closed, the user was blocked
from starting KQode and handed a remedy — "upgrade your binary" — that no
forward binary can ever satisfy.

## Symptoms
- `Store::open_or_bootstrap_at` returns `StoreError::MigrationHistory` with `Kind::DivergentVersion(_, _)`; the backend exits with the store-fatal code and `kqode.backend.ready` never fires.
- The printed `KQODE_STORE_FATAL:` line read "Upgrade to a KQode binary that knows this database migration history." — a dead end.
- Most likely trigger: a stored `refinery_schema_history` checksum that no longer matches the embedded migration bytes (e.g. a shipped `.sql` file was rebuilt after CRLF↔LF line-ending drift, or an already-applied migration was edited).

## What Didn't Work
Routing `DivergentVersion` to the "upgrade" remedy. The original classifier had:

```rust
pub(super) fn is_upgrade_only_history_error(err: &refinery::Error) -> bool {
    match err.kind() {
        refinery::error::Kind::DivergentVersion(_, _) => true,        // <- wrong
        refinery::error::Kind::MissingVersion(migration) => {
            i64::from(migration.version()) > super::migrations::latest_version()
        }
        _ => false,
    }
}
```

"Upgrade" only helps when the database is genuinely *ahead* of the running
binary. A `DivergentVersion` is the opposite situation: the version exists in
this binary, but its bytes hashed differently when the row was written. No
future binary can reproduce the old checksum, so upgrading is a dead end — and
worse, it hides the one remedy that actually works.

## Solution
Drop the `DivergentVersion => true` arm so only a database that is genuinely
ahead of this binary is classified as upgrade-only. `DivergentVersion` then
falls through to the standard `reset_remedy` path (`src/store/error.rs`
`remedy()`), which tells the user to delete the rebuildable index and restart.

```rust
pub(super) fn is_upgrade_only_history_error(err: &refinery::Error) -> bool {
    match err.kind() {
        // Only a DB genuinely *ahead* of this binary is fixed by upgrading:
        // an applied migration whose version this binary does not embed.
        refinery::error::Kind::MissingVersion(migration) => {
            i64::from(migration.version()) > super::migrations::latest_version()
        }
        _ => false,
    }
}
```

The fix is guidance-only: the store is never auto-deleted. The remedy from
`reset_remedy` instructs the user to remove `~/.kqode/kqode.db` plus its `-wal`
and `-shm` sidecars and restart, after which the next open reindexes sessions
and memory from JSONL truth. (Close every KQode instance for the OS user
first — the DB is shared per user.)

## Why This Works
The two refinery history errors describe opposite realities, and only one is
fixed by a newer binary:

| refinery `Kind` | Meaning | Correct remedy |
| --- | --- | --- |
| `MissingVersion(v)` where `v > latest_version()` | DB has an applied migration this binary doesn't know; data is intact and ahead | **Upgrade** to a binary that embeds `v` |
| `DivergentVersion(_, _)` | Checksum mismatch on a version this binary *does* embed (drift on an immutable migration) | **Reset** the rebuildable index (delete + restart; rebuilds from JSONL) |

Narrowing `is_upgrade_only_history_error` to the first row routes the second
row to the safe reset. The reset is safe for the store's *truth*: sessions and
memory reindex from JSONL on the next open (`reindex_sessions_from_logs` +
`reindex_memory_from_files`), the same file-truth design captured in
`architecture-patterns/local-memory-file-truth-and-inbox-audit.md`.

Three tables are the exception — `provider_settings`, `active_selection`, and
`ui_preferences` are authoritative *in* SQLite with no JSONL source and no
reindex step, so a reset drops connected-provider metadata, the active
`(provider, model)` selection, and the theme. These are lightweight,
user-recreatable config, not transcripts: the user reconnects with `/login` and
re-selects with `/model`. API keys live in the OS keychain
(`com.nincere.kqode.providers`), not the DB, so they survive the reset and are
simply re-linked on reconnect.

## Prevention
- **Primary guardrail already in place:** `.gitattributes` pins `*.sql text eol=lf`, so a CRLF checkout on Windows can no longer diverge an embedded migration's checksum from the LF-computed value. This is the front-line defense against the most common `DivergentVersion` trigger.
- **Treat shipped migrations as immutable.** Never edit the bytes of a migration that may already be applied in someone's `refinery_schema_history`; add a new `V{n}` migration instead. The pinned-checksum tests (`v1_migration_checksum_is_pinned`, `v4_migration_checksum_is_pinned` in `src/store/tests.rs`) turn any accidental edit into a loud, intentional test failure.
- **Recovery is the safety net, not the fix.** When a `DivergentVersion` still slips through, the classifier now points to the safe reset and the store stays fail-closed and never auto-deletes the DB — so the user recovers without losing transcript truth (only provider/model/theme config needs re-entering; see Why This Works).
- **Regression test:** `divergent_applied_migration_points_to_the_safe_reset` (`src/store/tests.rs`) asserts the remedy contains `delete` and `rebuilds from jsonl`, does **not** contain `upgrade`, and that the DB file still exists after the failure (no auto-delete).

## Related Issues
- `docs/solutions/architecture-patterns/local-memory-file-truth-and-inbox-audit.md` — SQLite as a fail-closed, rebuildable index over JSONL truth; explains why the reset remedy is safe.
- `.gitattributes` (`*.sql text eol=lf`) — the guardrail that prevents the CRLF-drift trigger for `DivergentVersion`.
- `src/store/recovery.rs` (`is_upgrade_only_history_error`, `reset_remedy`) and `src/store/error.rs` (`remedy`) — the classifier and remedy builder changed by this fix.
