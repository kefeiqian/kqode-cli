---
title: "feat: Exit-card resume command and --resume=<id> CLI entry"
type: feat
status: completed
date: 2026-07-11
origin: docs/brainstorms/2026-07-11-exit-card-resume-command-requirements.md
---

# feat: Exit-card resume command and `--resume=<id>` CLI entry

## Summary

Fill the exit-summary card's already-scaffolded **Resume** row so a resumable session prints `kqode --resume=<id>` on exit, and add a real `--resume=<id>` launch flag that boots straight back into that session by reusing the existing `/resume` plumbing. The work is entirely TUI-side (no Rust or protocol changes): the durable session id and its resumability both come from the existing `kqode.session.list` API, cached into a TUI atom during the run and read at exit.

---

## Problem Frame

Quitting the TUI mid-conversation leaves no breadcrumb back to that exact session — the user must relaunch, open `/resume`, and re-find the row by recency. The exit card reserves a `Resume` row but renders nothing, and there is no shell command to reopen a specific session. See origin (Sources & References) for the full problem framing.

---

## Requirements

**Exit card Resume row**
- R1. On exit from a resumable session, the exit card includes a Resume row showing the exact shell command to reopen it.
- R2. The row renders `kqode --resume=<id>` using the full durable session id and the `CLI_NAME` constant, in the existing labeled-row style.
- R3. When the session is not resumable, the Resume row is omitted entirely (the card is unchanged from today).
- R4. The row inherits the card's existing constraints: prints only on the clean-exit TTY path, degrades with the card in narrow terminals (full id preserved, not truncated), and never turns shutdown into an error.

**Resumability (the "valid session" gate)**
- R5. "Resumable" means the session would appear in `/resume` — the card and `/resume` must never disagree.
- R6. A session opened via resume (`/resume` or `--resume=<id>`) is resumable from the start of that run; exiting it shows the Resume row.
- R7. The id shown is the session currently attached to the runtime at exit, including after a mid-run resume or workspace relaunch.

**`kqode --resume=<id>` CLI entry**
- R8. `kqode --resume=<id>` launches the TUI and reopens the identified session directly (restoring its transcript, switching into its original folder) without opening the picker.
- R9. Resuming by id continues the existing session record — no duplicate session.
- R10. `kqode` with no `--resume` continues to start a fresh session; `--resume` is additive and optional.
- R11. An unknown or unresumable `--resume=<id>` surfaces a clear error and does not silently start an unrelated fresh session.

**Reconciliation with the picker**
- R12. The `/resume` picker continues to not display raw ids; the exit command is the only id surface.

**Origin actors:** A1 (user), A2 (Ink TUI), A3 (Rust backend + local session store), A4 (shell)
**Origin flows:** F1 (resume command shown on exit), F2 (reopen a session by id from the shell)
**Origin acceptance examples:** AE1 (covers R1, R2, R5), AE2 (**corrected here** — see Key Technical Decisions; the corrected example spans *row present* for a resumable no-provider session (R1, R5) and *row omitted* for a never-submitted session (R3)), AE3 (covers R6, R7), AE4 (covers R8, R9), AE5 (covers R11)

---

## Scope Boundaries

- No Rust or JSON-RPC protocol changes — reuse the existing `kqode.session.list` / `kqode.session.resume` APIs.
- No change to the `/resume` picker's columns or its deliberate hiding of raw ids.
- No clipboard auto-copy of the resume command on exit.
- No Cost or Tokens row work — those remain placeholders from a separate milestone.
- No remote/cloud resume; `--resume` is local-only.
- No bare `--resume` "reopen most recent" shortcut.
- No LLM-generated session titles or summary changes.

---

## Context & Research

### Relevant Code and Patterns

- Exit card: `tui/src/components/AppExitSummary/formatExitSummaryCard.ts` (`ROW_LABELS` already contains `'Resume'`; `renderValue` returns `undefined` for it today), `computeExitSummary.ts`, `types.ts`, `printExitSummary.ts`, `finishSession.ts` (calls `dispose()` **before** `printExitSummary`).
- Session-scoped value-only atom pattern: `tui/src/state/global/session.ts` (`sessionStartedAtAtom`, `sessionGitBaselineAtom`), re-exported via `tui/src/state/global/index.ts`.
- Backend session-id flow: `tui/src/backend/runtime/backendRuntime.ts` (`client.onReady` — id only reaches the logger today).
- Resume plumbing: `tui/src/components/ResumeSurface/useResumeBackend.ts` (`resumeSelected`), `tui/src/backend/runtime/sessionResume.ts` (`resumeSessionIntoRuntime`), `tui/src/state/promptQueue/atoms.ts` (`hydrateResumedTranscriptAtom`, `resetTranscriptMirrorAtom`, `clearTranscriptAtom`), `tui/src/contracts/backend/sessionMessages.ts` (`SessionSummary`, `SESSION_STATUS_CURRENT`).
- CLI entry: `tui/src/cli/kqodeCli.tsx` (`createKqodeCommand` citty `args`, `launchTui`), `tui/src/bootstrap.ts` (`createAppRuntime`). Both `tui/main.tsx` and `tui/packaged/entry.packaged.tsx` funnel through `runKqodeCli`, so a flag defined once is inherited by both.
- Command-name constant: `tui/src/constants/product.ts` (`CLI_NAME = 'kqode'`).
- Resume row-formatting precedent: `tui/src/libs/resume/formatSessionRows.ts` (existing `libs/resume/` home for pure resume helpers).

### Institutional Learnings

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md` — the backend is owned at the composition root, not in a state atom; a guardrail test (`tui/src/__tests__/backendIsolation.test.ts`) forbids `state/**` and `components/**` from importing launch/process code. Boot-time resume must run at the composition root (`bootstrap.ts`), using the client seam.
- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md` — `state/` is atoms-only; pure helpers/types live in `libs/<domain>/` (components → state → libs, one-way). Verify cycles with the repo's custom detector, not `madge` (false pass under the alias + `.ts`-extension setup).
- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md` — live-TUI edge/width rules apply to alt-screen chrome; the exit card is printed to the **normal buffer after teardown**, so those rules do not bind it (it degrades via its own column measurement). Only the `Changes` row uses `colorize`; the Resume value must render plain.

### External References

- None — the change follows established local patterns.

---

## Key Technical Decisions

- **Reuse `kqode.session.list` as the resumability source; no new protocol.** The `ready` notification's sessionId is the *debug-log* id (`debug_log::new_session_id()` in `src/backend/mod.rs`), **not** the durable UUIDv7 resume id minted lazily at first enqueue (`src/conversation/persistence.rs`). `session.list` returns only resumable sessions and marks the active one `status: Current`, so a single call yields the durable id **and** proves resumability, matching `/resume` exactly (R5). Alternative (a new backend "session resumable" notification) was rejected as more surface for no benefit.
- **Cache in a TUI atom during the run; read at exit.** `finishSession` disposes the backend before printing the card, so resumability + id cannot be fetched at exit. A single `currentSessionIdAtom` (`string | undefined`) is populated while the backend is alive; `undefined` ⇒ omit the row. One atom (id-only) is used instead of a separate boolean because the id is only ever set from a resumable source.
- **Capture trigger is the backend `enqueued` transcript event.** The backend emits `enqueued` **after** `on_enqueue` persists the session (`src/conversation/state.rs::enqueue`), so refreshing from `session.list` on `enqueued` cannot race the session's *persistence* (the row exists before the event fires) and covers the "in-flight at exit" case. The TUI's own `listSessions()` round-trip is best-effort, not synchronous: it is a fast local call that effectively always lands before a human-timed exit, but a submit-then-immediate-quit within a few milliseconds may omit the row for a genuinely resumable session — an accepted sub-perceptible window (see Risks & Dependencies). The client-only error path (backend unavailable / `submit()` throws) never produces a backend `enqueued` event, so it correctly does not mark the session resumable.
- **AE2 correction (behavioral).** Research shows `on_enqueue` writes `first_prompt_summary` **before** the provider check, so a "no provider connected" first submit **does** create a resumable session that `/resume` lists. Per origin R5 and the user's "exactly what `/resume` lists" decision, the Resume row **shows** for that session; only a *never-submitted* session (no backend `enqueued`) is excluded. The origin's AE2 parenthetical ("no provider → no row") described intent the store does not implement; making it literally true would require backend changes that also change `/resume`, which is out of scope.
- **Boot-resume lives in `createAppRuntime`, before the alternate screen.** Run the resume after backend readiness (post-`resolveInitialTheme`) and **before** `enterAlternateScreen()`, so an unknown id fails to the normal buffer with a non-zero exit and no screen flash. Reuse a shared `resumeSessionById` helper (also adopted by the picker hook) rather than duplicating the list→find→resume→hydrate sequence.
- **Flag name via a shared constant.** Define `RESUME_ARG_NAME` once so the citty arg and the printed command agree (AGENTS constants rule), and print the command with `CLI_NAME`, never a literal.

---

## Open Questions

### Resolved During Planning

- Where does the durable resume id come from? → `session.list`'s `Current` row (not the `ready` notification, which is the debug-log id).
- How does the TUI know the session is resumable without a backend call at exit? → cache during the run, triggered by the backend `enqueued` event.
- Does a no-provider submit count as resumable? → Yes (see AE2 correction).

### Deferred to Implementation

- Final wording of the bad-id error string (the content contract is decided in U5: echo the id, point to `kqode` → `/resume` recovery, stderr, non-zero exit).
- Whether to mirror `setSessionWindowTitle` on the boot path (cosmetic; the picker does it).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

How the durable id reaches the exit card, and the two ways it gets set:

```text
FRESH SESSION                          RESUMED SESSION (picker or --resume=<id>)
first prompt submitted                 resumeSessionById(store, client, id)
  -> backend 'enqueued' event            -> listSessions() find folder (unknown id => error)
  -> runtime: if id unknown,             -> resumeSessionIntoRuntime(...)
     listSessions() -> Current row       -> hydrateResumedTranscriptAtom(resumed)
  -> set currentSessionIdAtom = id            -> set currentSessionIdAtom = resumed.sessionId
        \                                         /
         v                                       v
              currentSessionIdAtom (string | undefined)
   reset to undefined on resetTranscriptMirrorAtom / clearTranscriptAtom
                         |
        EXIT: finishSession() -> dispose() (backend gone) -> printExitSummary()
                         |
   computeExitSummary reads the atom -> resumeCommand = buildResumeCommand(id) (or undefined)
                         |
   formatExitSummaryCard renders the 'Resume' row plain, or omits it when undefined
```

Boot flow for `kqode --resume=<id>` (inside `createAppRuntime`):

```text
citty args.resume -> launchTui(resumeSessionId) -> createAppRuntime(resumeSessionId)
  start backend -> await readiness (resolveInitialTheme)
  if resumeSessionId (non-empty):
      try  resumeSessionById + hydrate      -> continue to enterAlternateScreen (first frame shows transcript)
      catch (unknown id / failure)          -> disposeBackend, throw BootResumeError
  ...caller prints the error and exits non-zero (never enters the TUI)
```

---

## Implementation Units

### U1. Resume-command builder and shared flag-name constant

**Goal:** A pure helper that builds `kqode --resume=<id>` from a session id, plus the single flag-name constant shared by the builder and the CLI arg.

**Requirements:** R2, R12

**Dependencies:** None

**Files:**
- Create: `tui/src/constants/cli.ts` (export `RESUME_ARG_NAME`)
- Create: `tui/src/libs/resume/resumeCommand.ts` (`buildResumeCommand(sessionId): string`)
- Test: `tui/src/libs/resume/__tests__/resumeCommand.test.ts`

**Approach:**
- `buildResumeCommand` returns `` `${CLI_NAME} --${RESUME_ARG_NAME}=${sessionId}` `` using `CLI_NAME` from `tui/src/constants/product.ts` and `RESUME_ARG_NAME`.
- Keep `libs/` free of `@state` imports; import only from `constants/` (dependency-free). No barrel `index.ts` in `libs/`.

**Patterns to follow:**
- `tui/src/libs/resume/formatSessionRows.ts` (pure resume helper, colocated tests).
- AGENTS "constants & enums": no literal `'kqode'` or `'--resume'`.

**Test scenarios:**
- Happy path: a UUIDv7 id → `kqode --resume=<uuid>` (asserts the exact `--<RESUME_ARG_NAME>=` shape and `CLI_NAME`).
- Edge case: an id containing hyphens/hex is passed through unchanged (full id, not truncated).

**Verification:**
- Helper compiles under `cargo xtask tui-typecheck`; its unit test passes and asserts the command uses the constant, not a literal.

---

### U2. Current-session-id atom and fresh-session capture

**Goal:** Track the durable resumable session id in TUI state during the run, sourced from `session.list`, reset on the backend's session-lifecycle boundaries.

**Requirements:** R1, R3, R5, R7

**Dependencies:** None

**Files:**
- Modify: `tui/src/state/global/session.ts` (add `currentSessionIdAtom = atom<string | undefined>(undefined)`)
- Modify: `tui/src/state/global/index.ts` (re-export)
- Create: `tui/src/libs/resume/currentSessionId.ts` (`selectCurrentSessionId(sessions): string | undefined` — the `status === SESSION_STATUS_CURRENT` row's id)
- Create: `tui/src/libs/resume/__tests__/currentSessionId.test.ts`
- Modify: `tui/src/backend/runtime/backendRuntime.ts` (on a backend `enqueued` event, if the atom is `undefined`, fire-and-forget `client.listSessions()` and set the atom via `selectCurrentSessionId`)
- Modify: `tui/src/state/promptQueue/atoms.ts` (reset `currentSessionIdAtom` to `undefined` in `resetTranscriptMirrorAtom` and `clearTranscriptAtom`)
- Test: `tui/src/backend/runtime/__tests__/backendRuntime.test.ts` (capture wiring)

**Approach:**
- The atom mirrors the existing value-only session atoms and is seeded/updated only by the composition root / runtime, never threaded as props.
- Capture is guarded on `undefined`: it fetches `session.list` on each `enqueued` event while the id is still unknown (so a fetch that races a concurrent enqueue or transiently returns no `Current` row is retried) and stops once the atom is set; a reset clears it so the next `enqueued` re-fetches.
- The fetch is best-effort fire-and-forget (mirroring the existing "refresh git status on settle" pattern). On the common path — exiting after a turn settles — it always lands before exit; a submit-then-immediate-quit within the few-millisecond `session.list` round-trip may leave the atom `undefined` and omit the row (an accepted sub-perceptible window — see Risks & Dependencies).
- `selectCurrentSessionId` is pure and lives in `libs/` (it may import the `SESSION_STATUS_CURRENT` contract constant, which is dependency-free).

**Patterns to follow:**
- `tui/src/state/global/session.ts` value-only atoms.
- `tui/src/backend/runtime/backendRuntime.ts` existing `refreshGitStatusUnlessDisposed` fire-and-forget shape.

**Test scenarios:**
- Happy path (`selectCurrentSessionId`): a list with one `Current` row → its id; no `Current` row → `undefined`; multiple `Idle` rows only → `undefined`.
- Integration: a backend `enqueued` event with the atom unset triggers a `listSessions` call and stores the `Current` row id (fake client returns a `Current` row).
- Edge case: a second `enqueued` event while the atom is already set does **not** re-fetch.
- Edge case: `resetTranscriptMirrorAtom` and `clearTranscriptAtom` each reset the atom to `undefined`.
- Edge case (R5 window): the capture is best-effort — a submit-then-immediate-exit before `listSessions` resolves leaves the atom `undefined` (row omitted); this window is documented and accepted, not asserted impossible.

**Verification:**
- After a first backend-accepted turn, `store.get(currentSessionIdAtom)` equals the `Current` row id; after a conversation clear it is `undefined`.

---

### U3. Exit-card Resume row

**Goal:** Render the Resume row from the cached id, omitting it when there is nothing to resume.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1, U2

**Files:**
- Modify: `tui/src/components/AppExitSummary/types.ts` (add `resumeCommand: string | undefined` to `ExitSummaryData`)
- Modify: `tui/src/components/AppExitSummary/computeExitSummary.ts` (read `currentSessionIdAtom`; when defined, `resumeCommand = buildResumeCommand(id)`)
- Modify: `tui/src/components/AppExitSummary/formatExitSummaryCard.ts` (`renderValue` `'Resume'` branch returns `data.resumeCommand`, plain/uncolored; `undefined` ⇒ row omitted)
- Test: `tui/src/components/AppExitSummary/__tests__/computeExitSummary.test.ts`, `tui/src/components/AppExitSummary/__tests__/formatExitSummaryCard.test.ts`

**Approach:**
- Keep the `undefined = omit row` convention already used for Changes/Duration/Cost/Tokens.
- Build the command in the data layer (`computeExitSummary`) via U1, so the formatter stays a dumb renderer.
- Resume value renders with no `colorize` (background-agnostic), consistent with the Cost/Tokens rows and the card's colorization rationale.

**Patterns to follow:**
- `formatExitSummaryCard.renderValue` existing per-label branches and the `LABEL_WIDTH`/`COLUMN_GAP` padding.
- The card's `renderCard` width-degradation ladder (block banner → wordmark → borderless stacked rows).

**Test scenarios:**
- Covers AE1. Happy path: `currentSessionIdAtom` set → card includes `Resume   kqode --resume=<id>`.
- Covers AE2 (corrected), R1, R5. Edge case: a session whose only turn settled `needsConfiguration` but whose id is set (resumable) → the Resume row **is** present.
- Covers AE3. Happy path: after hydrate sets the id to a resumed session's id, the row shows that id.
- Covers AE2 (corrected)/R3. Edge case: `currentSessionIdAtom` `undefined` (never submitted) → no Resume row; card byte-identical to the current Changes/Duration-only output.
- Edge case: a long full id on a narrow terminal degrades the card to borderless stacked rows with the id intact (not truncated).

**Verification:**
- `formatExitSummaryCard` renders the row only when `resumeCommand` is present; existing card tests still pass.

---

### U4. Shared `resumeSessionById` helper; set id on resume

**Goal:** Extract a single "resume by id" helper used by both the picker and the boot path, and set `currentSessionIdAtom` whenever a resumed transcript hydrates (R6/R7).

**Requirements:** R6, R7, R8, R9, R11

**Dependencies:** U2

**Files:**
- Modify: `tui/src/backend/runtime/sessionResume.ts` (add `resumeSessionById({ store, client, sessionId })`: `listSessions()` → find the row by id (throw a typed `BootResumeError`/clear error when absent) → `resumeSessionIntoRuntime({ store, client, sessionId, workspaceCwd: row.folder })` → return `{ resumed, session }`)
- Modify: `tui/src/state/promptQueue/atoms.ts` (`hydrateResumedTranscriptAtom` also sets `currentSessionIdAtom = resumed.sessionId`)
- Modify: `tui/src/components/ResumeSurface/useResumeBackend.ts` (`resumeSelected` calls `resumeSessionById`, keeping its `turnInFlightAtom` guard, hydrate, window-title, and panel-close)
- Test: `tui/src/backend/runtime/__tests__/sessionResume.test.ts`

**Approach:**
- The helper owns list→find→resume; callers own hydrate + any surface-specific UI. This removes the duplicated find-by-id logic from the picker hook and gives the boot path a hook-free entry.
- Unknown-id detection happens in the helper (the row is absent from `listSessions`), producing a typed error the boot path and picker both surface (R11); the backend's `session.resume` also rejects unknown ids as a backstop.
- Setting the id in `hydrateResumedTranscriptAtom` covers both resume entry points in one place; the reset points from U2 keep it lifecycle-correct.

**Patterns to follow:**
- Existing `resumeSelected` sequence and `resumeSessionIntoRuntime` rollback-on-failure.
- `tui/src/backend/runtime/__tests__/sessionResume.test.ts` fake-client + `createStore()` harness.

**Test scenarios:**
- Covers AE4. Happy path: a valid id in another folder → `resumeSessionById` relaunches into that folder, resumes, returns the resumed payload; the picker hook still hydrates and closes.
- Covers AE5. Error path: an id absent from `listSessions` → helper throws the typed error; no resume/relaunch is attempted.
- Integration: `hydrateResumedTranscriptAtom` sets `currentSessionIdAtom` to `resumed.sessionId`.
- Edge case (R9): resuming reuses the same session id (no duplicate) — assert the returned/attached id equals the requested id.

**Verification:**
- The picker path behaves identically to today; `currentSessionIdAtom` is set after any resume; unknown ids raise a clear error.

---

### U5. `--resume=<id>` CLI flag and boot-resume

**Goal:** Add the optional `--resume=<id>` flag and reopen the session at boot before the alternate screen, with a clean error + non-zero exit on a bad id.

**Requirements:** R8, R9, R10, R11

**Dependencies:** U1, U4

**Files:**
- Modify: `tui/src/cli/kqodeCli.tsx` (add the `[RESUME_ARG_NAME]` string arg to `createKqodeCommand` **with an explicit one-line `description`** matching the `debug`-arg pattern, e.g. "Reopen a session by id (shown on the exit-card Resume line)"; thread `args.resume` into `launchTui`; wrap boot in a `try/catch` that prints a `BootResumeError` message and exits non-zero)
- Modify: `tui/src/bootstrap.ts` (`createAppRuntime` accepts `resumeSessionId?`; after `resolveInitialTheme` and **before** `enterAlternateScreen()`, when a non-empty id is present, `resumeSessionById` + `store.set(hydrateResumedTranscriptAtom, resumed)`; on failure `disposeBackend()` then rethrow the typed error)
- Test: `tui/src/cli/__tests__/kqodeCli.test.tsx` (arg presence/threading), `tui/src/__tests__/bootstrapResume.test.tsx` (boot-resume success + unknown-id failure) — colocate with existing bootstrap/CLI tests as they exist

**Approach:**
- Guard empty/whitespace `--resume` as an error (no bare-flag "most recent"; R10 keeps no-flag behavior unchanged).
- Perform resume before entering the alternate screen so a failure never flashes the TUI; on success the first frame already shows the hydrated transcript.
- Both entry points inherit the flag because they route through `runKqodeCli`; no packaged-entry edit is required.
- On an unknown/unresumable id the `BootResumeError` message is **actionable, not a dead-end**: because ids are shown nowhere else (R12), it echoes the offending id and points to the recovery path (open `kqode`, then `/resume` to pick a session), written to stderr with a non-zero exit. The content contract — echo id + recovery pointer + stderr + non-zero — is decided here; only the final wording is a copy detail.

**Execution note:** Start with a failing test for the unknown-id path (error surfaced, backend disposed, no alt-screen entry, non-zero exit) to pin R11 before wiring the happy path.

**Patterns to follow:**
- `createKqodeCommand` existing `debug` arg and `run({ args })` threading.
- `createAppRuntime` "seed before first frame" band (session seed, window size, theme) and its `disposeBackend`/exit-listener wiring.

**Test scenarios:**
- Covers AE4. Happy path: `--resume=<validId>` → backend starts, `resumeSessionById` + hydrate run before `enterAlternateScreen`, runtime returns ready to render.
- Covers AE5. Error path: `--resume=<unknownId>` → `BootResumeError`, backend disposed, no alt-screen entry, process exits non-zero with a clear message.
- Edge case (R10): no `--resume` → unchanged fresh-session boot (no resume attempted).
- Edge case: `--resume=` (empty/whitespace) → treated as an error, not a fresh session.

**Verification:**
- `kqode --resume=<id>` from a different folder reopens that session; `kqode` alone is unchanged; a bad id exits non-zero with a clear message and never enters the TUI.

---

## System-Wide Impact

- **Interaction graph:** new reads of `session.list` on the first `enqueued` event and at boot (for `--resume`); the exit card gains one atom read. No change to the submit/settle hot path.
- **Error propagation:** boot-resume failures surface as a typed `BootResumeError` caught at the CLI entry (print + non-zero exit); in-session resume failures continue to surface through the picker's existing failure atom. `session.list` capture failures are swallowed (fire-and-forget) — a missing id just omits the row, never breaks a turn or exit.
- **State lifecycle risks:** `currentSessionIdAtom` must reset on `resetTranscriptMirrorAtom` (respawn) and `clearTranscriptAtom` (fresh draft) to stay in lockstep with the backend's `current_session`; otherwise the card could print a stale id. Covered by U2 tests.
- **API surface parity:** the `/resume` picker and the exit card now share the same resumability definition (`session.list`'s `Current` row), so they cannot drift (R5); the picker and the boot path (not the exit card) additionally share the `resumeSessionById` helper.
- **Integration coverage:** the fresh-capture path (backend `enqueued` → `session.list` → atom) and the boot-resume path are proven with fake-client harnesses, not mocks alone.
- **Unchanged invariants:** no Rust/protocol change; the `ready` notification, `/resume` columns/id-hiding, and no-flag `kqode` startup are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Card prints a stale id after respawn/clear | Reset `currentSessionIdAtom` on `resetTranscriptMirrorAtom` and `clearTranscriptAtom`; unit-tested (U2). |
| Boot-resume flashes or corrupts the alt screen on a bad id | Run resume before `enterAlternateScreen`; on failure dispose and exit to the normal buffer (U5). |
| `enqueued`-triggered `session.list` races the session's persistence | `enqueued` is emitted only after `on_enqueue` persists the session, so the fetch cannot race persistence (verified in `src/conversation/state.rs`). |
| Row omitted for a resumable session on a submit-then-immediate-quit (before the best-effort `listSessions` lands) | Accepted sub-perceptible window: the capture is a fast local call that lands before any human-timed exit, and the common path (exit after settle) always captures. Documented in U2 / Key Technical Decisions, not defended against. |
| Guardrail test fails if resume logic leaks into `state/**` | Keep boot-resume at the composition root and pure helpers in `libs/`; verify with `backendIsolation.test.ts` and the repo's custom cycle detector (not `madge`). |
| AE2 behavior surprises reviewers | Documented as an explicit Key Technical Decision and encoded in U3 test scenarios. |

---

## Documentation / Operational Notes

- Update `tui/src/components/AppExitSummary/README.md` to note the Resume row now has a data source (the cached durable session id), and drop the "always omitted" wording for Resume.
- `--resume` appears in `kqode --help` automatically (citty derives the flag from `args`); give the arg an explicit `description` (as the `debug` arg does) so the auto-generated help entry self-explains — see U5.

---

## Sources & References

- **Origin document:** docs/brainstorms/2026-07-11-exit-card-resume-command-requirements.md
- Related code: `tui/src/components/AppExitSummary/`, `tui/src/backend/runtime/sessionResume.ts`, `tui/src/cli/kqodeCli.tsx`, `tui/src/bootstrap.ts`, `src/conversation/persistence.rs`, `src/backend/sessions.rs`, `src/store/sessions.rs`
- Related brainstorms: docs/brainstorms/2026-07-08-local-session-resume-requirements.md, docs/brainstorms/2026-07-01-tui-exit-summary-card-requirements.md
