---
title: "feat: Local session resume"
type: feat
status: completed
date: 2026-07-08
origin: docs/brainstorms/2026-07-08-local-session-resume-requirements.md
deepened: 2026-07-08
---

# feat: Local session resume

## Summary

Implement `/resume` as a backend-owned local session feature: Rust persists resumable session records and history, exposes list/load capabilities over the existing JSON-RPC boundary, and the Ink TUI renders a fullscreen picker plus runtime switching into the selected workspace. The plan keeps session identity distinct from per-spawn debug logging, persists only non-empty sessions, and treats `/clear` as the start of a brand-new hidden session.

---

## Problem Frame

KQode already has SQLite bootstrap and a backend-owned transcript loop, but session history still disappears with the backend process. The new `/resume` flow needs to bridge that gap without turning the TUI into the storage owner or confusing process-level debug sessions with durable conversation sessions (see origin: `docs/brainstorms/2026-07-08-local-session-resume-requirements.md`).

---

## Requirements

- R1. Persist enough local session history and metadata to reopen a prior session after restart.
- R2. Keep `/resume` local-only in v1.
- R3. Restore enough conversation history to continue the same session.
- R4. Show `/resume` as a single session table with no top tabs.
- R5. Render `#`, `Summary`, `Status`, `Modified`, `Created`, and `Folder`.
- R6. List sessions from any workspace.
- R7. Sort rows by last modified, newest first.
- R8. Keep `#` display-only and hide real session IDs.
- R9. Seed the v1 summary from the first user prompt.
- R10. Show folder context clearly enough to distinguish workspaces.
- R11. Visible sessions use `Current` / `Idle` as the local-only v1 status model; if the active session is still a hidden draft, no `Current` row is shown.
- R12. Hide a session until its first submitted prompt.
- R13. Resume into the session's original folder.
- R14. Continue the same session record after resume.
- R15. Do not expose raw session IDs in the UI.
- R16. Do not include remote/local switching controls.
- R17. Do not depend on LLM-generated titles in v1.

**Origin actors:** A1 (KQode user), A2 (KQode TUI), A3 (local session store)
**Origin flows:** F1 (resume a prior session), F2 (create a resumable session)
**Origin acceptance examples:** AE1 (table layout and ordering), AE2 (first-prompt summary and hidden empty sessions), AE3 (cross-workspace resume), AE4 (local-only scope)

---

## Scope Boundaries

- No remote session sync, remote tab, or local/remote toggle.
- No raw session ID display in the picker or any other v1 TUI surface.
- No LLM-generated title generation in v1; the first user prompt remains the summary source.
- No listing of empty sessions that never received a submitted prompt.
- No background session switching while the current session still has an active or pending turn.

### Deferred to Follow-Up Work

- Rename, delete, checkpoint, export, or replay controls for saved sessions: future session-management work after v1 resume lands cleanly.
- Richer summary/title generation from the first assistant response or later offline summarization: future iteration after durable resume exists.

---

## Context & Research

### Relevant Code and Patterns

- `src/store/mod.rs` and `src/store/providers.rs` establish the per-operation SQLite pattern: fresh connections, one focused store method per query/update, and fail-closed startup if migrations or sanity checks fail.
- `migrations/V1__initial_schema.sql` already seeds `sessions` and `turns`, but only as a foundation spine; runtime code does not yet use them for actual session persistence, and shipped migrations must remain forward-only.
- `src/conversation/transcript.rs` and `src/conversation/state.rs` own the backend transcript and queue lifecycle today; they are the natural seam for durable session ids, persisted turn capture, interrupted-turn handling, and `/clear` rollover.
- `src/protocol/mod.rs`, `src/backend/mod.rs`, and `tui/src/contracts/backend/messages.ts` / `tui/src/backend/protocol/messageProtocol.ts` show the mirrored JSON-RPC pattern to extend for session list/load requests.
- `tui/src/libs/commands/registry.ts`, `tui/src/libs/commands/executeCommand.ts`, and `tui/src/state/ui/surface/atoms.ts` show how slash commands open fullscreen surfaces without pushing storage logic into the TUI.
- `tui/src/components/ModelSurface/index.tsx` and `tui/src/state/ui/model/atoms.ts` are the closest existing fullscreen picker pattern for a `/resume` table surface.
- `tui/src/backend/client/backendClient.ts`, `tui/src/backend/process/backendProcess.ts`, and `tui/src/backend/runtime/backendRuntime.ts` show that backend cwd is fixed at launch time; cross-workspace resume therefore needs runtime rebind/restart behavior, not just state repainting.
- `tui/src/bootstrap.ts` seeds `workspaceCwdAtom`, `sessionStartedAtAtom`, and `sessionGitBaselineAtom` once per TUI process, so cross-workspace resume must deliberately reclassify which state is conversation-scoped versus process-scoped.

### Institutional Learnings

- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`: core runtime/state belongs in Rust, and the TUI should stay a client/mirror rather than owning persistence.
- `docs/research/2026-06-26-session-resume-storage-patterns.md`: earlier research recommended workspace-scoped lists, but the new origin deliberately overrides that with one global local table; the plan must preserve folder visibility and safe workspace rebinding.
- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`: keep sort/filter/format helpers pure and outside atoms to avoid state cycles as the picker grows.
- `docs/solutions/architecture-patterns/terminal-edge-rendering-tradeoffs-in-the-ink-tui.md`: fullscreen list surfaces must respect safe content width and avoid final-column rendering regressions.

### External References

- None. Local repo patterns are strong enough for this feature, and the main uncertainty is KQode-specific ownership and runtime behavior rather than third-party framework usage.

---

## Key Technical Decisions

- **Durable session id is separate from backend-ready `sessionId`:** the existing ready-notification id stays a per-spawn debug/log correlation id, while resumable conversation identity becomes its own stable stored key. This avoids breaking current log semantics while satisfying restart-safe resume.
- **Append-only local session history remains the replay truth; SQLite is the query index:** v1 should not silently turn the SQLite index into the sole source of resume truth. The plan keeps a durable append-only session log for transcript reconstruction, projects replay metadata into SQLite idempotently, and includes a bootstrap/reindex path so the existing “reset DB, rebuild index” recovery contract stays true.
- **Persistence begins on first accepted submit, not backend startup:** a brand-new launch stays hidden until its first submitted prompt, which aligns the durable session record with real user work rather than process starts.
- **`/clear` starts a fresh hidden session:** clearing no longer means “empty the same durable record.” It ends the current session’s continuity and rolls the runtime onto a new hidden draft session that becomes visible only after its first prompt.
- **Resume is backend-owned and TUI-rendered:** Rust owns list/query/load behavior and transcript restoration data, while the TUI only opens the surface, renders rows, and coordinates runtime switching.
- **The stored durable session id is the hidden contract identity:** the visible `#` column is purely presentation, while list/select/load requests keep using the existing durable session id as a non-rendered contract field rather than inventing a second transport-only identifier.
- **Cross-workspace resume is a runtime rebind problem:** selecting a session from another folder must switch the backend runtime into that workspace before future submits continue, so cwd-sensitive behavior (`.env`, git status, system prompt) stays coherent.
- **Runtime relaunch stays composition-root owned:** cross-workspace resume may require a new launcher/factory seam, but process spawning must remain owned by the composition root so source and packaged entries stay aligned.
- **`Current` is local-session scoped, not a global lease:** the picker marks the session attached to the active TUI runtime as `Current` when that session is visible; a fresh hidden draft session may leave the table with no visible `Current` row until its first prompt.
- **Active/pending work blocks switching:** `/resume` cannot replace the current session while a turn is active or pending; the user must wait or cancel first.
- **`/clear` is rollover, not deletion:** old sessions remain resumable until later delete semantics exist, and docs must be explicit that clear starts a new draft rather than erasing saved history.
- **Local session data is private app-state, not log output:** durable prompts, summaries, and workspace paths must stay under the user-private KQode storage area, avoid leaking into debug logs, and be documented as manually retained until later delete support exists.

---

## Open Questions

### Resolved During Planning

- **What happens after `/clear`?** `/clear` ends the current durable session and starts a brand-new hidden draft session that remains absent from `/resume` until its first submitted prompt.
- **What if the user tries to switch sessions mid-turn?** `/resume` is blocked while the current session has an active or pending turn; the current turn must settle or be cancelled first.
- **How should `Current` behave for a hidden draft session?** The table may temporarily show no `Current` row if the active session has not yet earned visibility.
- **Should resume reuse the current debug-log session id?** No. Resume keeps a stable conversation id while allowing backend respawns to keep minting fresh per-process debug ids.
- **How should narrow tables render?** Resume rows stay single-line and non-wrapping; `#`, `Status`, `Modified`, and `Created` keep fixed/minimum widths, while `Summary` and then `Folder` truncate to fit the safe content width.
- **What states does the picker expose during list/load handoff?** The surface explicitly models `loading-list`, `loaded`, `resuming`, `resume-failed`, and `empty`, with navigation disabled while `resuming`.

### Deferred to Implementation

- **Interrupted-turn presentation after restart:** the plan requires deterministic restoration semantics, but the final wording/row styling for interrupted turns can be decided once the persistence shape is coded.
- **Multi-window same-session contention policy beyond local `Current` display:** v1 can avoid a cross-process lease system, but any stronger concurrency guard should be evaluated after the first working resume path exists.

---

## Output Structure

    src/
      backend/
        sessions.rs
      conversation/
        persistence.rs
        session_log.rs
      protocol/
        sessions.rs
      store/
        sessions.rs
    tui/src/
      components/AppExitSummary/
        computeExitSummary.ts
      backend/
        protocol/sessionProtocol.ts
        runtime/sessionResume.ts
      components/
        ResumeSurface/
          index.tsx
          ResumeRows.tsx
          useResumeInput.ts
          __tests__/ResumeSurface.test.tsx
      contracts/backend/
        sessionMessages.ts
        client.ts
        index.ts
      libs/resume/
        formatSessionRows.ts
      state/promptQueue/
        hydrateResumeTranscript.ts
      state/ui/
        resume/
          atoms.ts
          index.ts
          __tests__/atoms.test.ts
    tests/
      common/rpc.rs
      session_resume.rs

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  A[Backend launches in workspace cwd] --> B{First prompt submitted?}
  B -- No --> C[Hidden draft session only in memory]
  B -- Yes --> D[Mint durable conversation id + open append-only session log]
  D --> E[Append first durable session event to the session log]
  E --> F[Project session index row + summary seed into SQLite]
  F --> G[Append later session-log events and update SQLite projections idempotently]
  G --> H[/resume requests global local session list]
  H --> I{Selected session loadable and current queue idle?}
  I -- No --> J[Keep current runtime and surface a picker error]
  I -- Yes --> K{Selected session in current workspace?}
  K -- Yes --> L[Hydrate resumed transcript + session-scoped globals]
  K -- No --> M[Launch ready backend in target workspace via composition-root factory]
  M --> N[Commit runtime switch, then hydrate resumed transcript]
  L --> O[Continue appending to same durable session]
  N --> O
```

---

## Implementation Units

### U1. Extend the durable session store schema and query layer

**Goal:** Turn the provisional SQLite `sessions` / `turns` tables into a queryable local session index that can drive the `/resume` table and point resume logic at the authoritative session-log history.

**Requirements:** R1, R2, R5, R6, R7, R8, R9, R10, R12, R14

**Dependencies:** None

**Files:**
- Create: `migrations/V2__session_resume_index.sql`
- Modify: `src/store/mod.rs`
- Modify: `src/store/recovery.rs`
- Create: `src/store/sessions.rs`
- Modify: `src/store/tests.rs`

**Approach:**
- Expand the store schema so each durable session can answer the picker contract directly: stable durable id, created/modified timestamps, workspace cwd, first-prompt summary, and the metadata needed to locate and project authoritative session-log history.
- Add a forward-only migration instead of editing V1 in place; existing installs must upgrade cleanly without invalidating refinery checksum history or existing provider-selection data.
- Keep SQLite as the resumable-session index, not the only durable truth: the index should project list/load metadata while durable history can be reconstructed from the append-only session log introduced in U2.
- Define the rebuild path alongside the schema change: on startup and after explicit DB reset, KQode must be able to scan the append-only session logs and repopulate the SQLite index before the backend is considered ready.
- Keep the existing store conventions: one narrow method per operation, fresh SQLite connection per call, no shared connection state, and explicit rustdoc on new public store APIs.
- Preserve the current fail-closed store posture: migration or sanity issues must still block backend readiness rather than falling back silently.
- Prefer additive schema changes with integrity rules: referential links from projected turn metadata to sessions, unique per-session ordering, and idempotent projection rules so a first-write crash never leaves a partially visible session row.

**Patterns to follow:**
- `src/store/providers.rs`
- `src/store/mod.rs`
- `src/store/tests.rs`

**Test scenarios:**
- Happy path: inserting the first prompt for a new session creates one visible session row with created/modified timestamps, workspace cwd, and a summary derived from that first prompt. Covers AE2.
- Happy path: listing sessions across multiple workspaces returns all rows ordered by modified timestamp descending, with no raw session id in the projected row data. Covers AE1.
- Edge case: a brand-new launch with no submitted prompt produces no visible session row. Covers AE2.
- Edge case: when two sessions share the same modified timestamp, the query still returns a stable deterministic order.
- Error path: a migration/bootstrap run against an existing DB upgrades cleanly from the shipped V1 schema without breaking provider-selection tables or fail-closed behavior.
- Error path: failure during the first persisted write never leaves behind a partially visible session row with no first turn or summary.
- Integration: updating a resumed session appends to the existing durable record rather than inserting a replacement session row. Covers AE3.
- Integration: concurrent read/list activity while another process writes a session does not produce orphan turns or duplicate per-session order values.
- Integration: rebuilding the SQLite index from append-only session logs after a simulated DB reset reproduces list/load metadata without losing resumable sessions.

**Verification:**
- The store can create, update, list, and reload resumable sessions without depending on debug-log files or in-memory-only transcript state.

---

### U2. Persist conversation lifecycle events and hidden-session rollover in Rust

**Goal:** Teach the backend conversation layer when to mint a durable session, persist turns, mark interrupted work, and roll over to a new hidden draft session on `/clear`.

**Requirements:** R1, R3, R9, R12, R14, R17

**Dependencies:** U1

**Files:**
- Modify: `src/conversation/mod.rs`
- Modify: `src/conversation/coordinator.rs`
- Modify: `src/conversation/state.rs`
- Modify: `src/conversation/transcript.rs`
- Create: `src/conversation/persistence.rs`
- Create: `src/conversation/session_log.rs`
- Modify: `src/conversation/test_support.rs`
- Modify: `src/conversation/tests.rs`
- Modify: `src/backend/message.rs`
- Modify: `src/backend/mod.rs`

**Approach:**
- Add a durable-session lifecycle alongside the current in-memory queue lifecycle: hidden draft session at startup, durable id minted on first accepted submit, append-only session-log writes as the conversation evolves, and interrupted/pending turn states captured explicitly enough for restart-safe restoration.
- Make the session log the authoritative write path: append durable events first with stable event/session identity, then update the SQLite index idempotently so crash recovery can reconcile from log truth back into index state.
- Keep queue ownership in the backend conversation coordinator rather than letting handlers or the TUI write directly into SQLite.
- Make `/clear` a session rollover event: complete the old session’s continuity, reset transcript state, and re-arm the runtime with a new hidden draft session that becomes durable only after its first prompt.
- Preserve the separation between queue-visible turn ids and long-lived session identity.
- Define explicit durable state transitions for enqueue, activate, settle, cancel, interrupt, and clear so restart behavior is deterministic even if shutdown happens between lifecycle edges.

**Execution note:** Implement this unit characterization-first around the existing queue lifecycle so the new durable writes do not regress turn ordering or `/clear` semantics.

**Patterns to follow:**
- `src/conversation/coordinator.rs`
- `src/conversation/state.rs`
- `src/conversation/transcript.rs`
- `tests/message_submit.rs`

**Test scenarios:**
- Happy path: the first accepted submit in a fresh launch mints a durable session, persists the first prompt as summary seed, and keeps later submits attached to the same session until `/clear`. Covers AE2.
- Happy path: resuming a stored session and submitting again appends turns to the same durable session id instead of creating a second session row. Covers AE3.
- Edge case: calling `/clear` after a populated session resets the live transcript and starts a new hidden draft session that stays absent from `/resume` until a new prompt is submitted.
- Edge case: a prompt that settles with configuration-required or error state still counts as the first submitted prompt for visibility, because the requirement keys off submission rather than model success.
- Error path: interrupted active/pending turns are restored with deterministic non-streaming state after restart, never as silently completed turns.
- Error path: a crash between enqueue/activate/settle boundaries or during `/clear` rollover never attributes a turn to the wrong durable session on restart.
- Integration: persisted turn order matches the existing queue order and remains stable across enqueue, activate, settle, clear, and resume boundaries.
- Integration: when the session log and SQLite index diverge after an injected crash window, startup reconciliation restores one consistent resumable session view from log truth.

**Verification:**
- Backend conversation state can be shut down and later reconstructed from stored session/turn data without losing session continuity rules.

---

### U3. Add backend session-list and resume contracts

**Goal:** Expose local session list/load behavior over the existing JSON-RPC boundary so the TUI can open `/resume` without touching SQLite directly.

**Requirements:** R2, R4, R5, R6, R7, R8, R9, R10, R11, R13, R15, R16

**Dependencies:** U1, U2

**Files:**
- Create: `src/protocol/sessions.rs`
- Modify: `src/protocol/mod.rs`
- Create: `src/backend/sessions.rs`
- Modify: `src/backend/mod.rs`
- Modify: `src/backend/tests.rs`
- Create: `tui/src/contracts/backend/sessionMessages.ts`
- Modify: `tui/src/contracts/backend/client.ts`
- Modify: `tui/src/contracts/backend/index.ts`
- Create: `tui/src/backend/protocol/sessionProtocol.ts`
- Modify: `tui/src/backend/client/backendClient.ts`
- Modify: `tui/src/backend/client/messageConnectionClient.ts`
- Modify: `tui/src/backend/client/__tests__/backendClient.test.ts`

**Approach:**
- Introduce narrow request/response contracts for “list resumable sessions” and “load session history,” mirroring the existing provider/message protocol split.
- Keep transport identity separate from UI rendering: list responses carry the hidden durable session id for follow-up load/resume requests, while the TUI derives display numbering and formatting from that raw contract data.
- Add a first-class backend resume/attach operation so loading a saved session also rebinds the backend conversation owner to that durable session before future submits continue.
- Treat `Current` as a computed backend response field based on the active TUI runtime’s attached durable session rather than a persisted global lease.
- Block resume handoff when the current queue is active/pending and surface a typed backend rejection the TUI can render cleanly instead of attempting an unsafe mid-turn switch.

**Patterns to follow:**
- `src/protocol/providers.rs`
- `src/backend/providers.rs`
- `tui/src/contracts/backend/messages.ts`
- `tui/src/backend/protocol/messageProtocol.ts`

**Test scenarios:**
- Happy path: listing sessions returns one local-only table payload with rows sorted by modified time and shaped for the required columns. Covers AE1.
- Happy path: the active visible session row is marked `Current` and all others `Idle`.
- Edge case: when the active runtime session is still a hidden draft, the list returns no `Current` row rather than inventing a placeholder row.
- Error path: attempting to begin resume while a turn is active or pending returns a typed rejection without mutating the current session.
- Error path: a load request made after the table reorders still resolves the intended session via the hidden durable session id rather than the user-visible row number.
- Integration: loading a stored session returns enough transcript/session metadata for the TUI runtime to restore and continue the same durable session. Covers AE3.
- Integration: the backend attach/resume operation leaves the conversation coordinator pointed at the resumed durable session so later submits do not drift back onto a hidden draft.

**Verification:**
- The TUI can request session list/load data entirely through the backend contract surface, with mirrored Rust/TypeScript method names and payload shapes.

---

### U4. Rebind the TUI runtime into resumed sessions

**Goal:** Let the TUI dispose and relaunch its backend runtime into the selected workspace, then hydrate the restored transcript into the active session view.

**Requirements:** R1, R3, R6, R11, R13, R14

**Dependencies:** U2, U3

**Files:**
- Create: `tui/src/backend/runtime/sessionResume.ts`
- Modify: `tui/src/backend/runtime/backendRuntime.ts`
- Modify: `tui/src/bootstrap.ts`
- Modify: `tui/src/backend/runtime/__tests__/backendRuntime.test.ts`
- Create: `tui/src/backend/runtime/__tests__/sessionResume.test.ts`

**Approach:**
- Encapsulate resume orchestration in the runtime layer, not in UI atoms: list/load contract call, preflight validation, backend relaunch in the selected workspace cwd, and commit/rollback control over when the active runtime actually switches.
- Preserve startup/readiness semantics by continuing to wait on backend-ready notifications and by keeping per-spawn debug-log session ids separate from durable session ids.
- Keep process launch/lifecycle owned by the composition root by introducing or reusing an injected backend-factory seam rather than letting feature code spawn processes ad hoc.
- Keep failure rollback explicit: validate the target session before teardown, canonicalize and revalidate the stored workspace path before relaunch, switch only after the new backend reaches ready state and backend attach succeeds, and leave the current runtime intact if validation, relaunch, or post-ready resume fails.

**Patterns to follow:**
- `tui/src/backend/runtime/backendRuntime.ts`
- `tui/src/backend/client/backendClient.ts`
- `tui/src/bootstrap.ts`

**Test scenarios:**
- Happy path: resuming a session from another workspace relaunches the backend in that workspace, hydrates the transcript, and routes future submits to the resumed durable session. Covers AE3.
- Happy path: resuming a session from the current workspace reuses the same workspace binding but still reloads the stored transcript into the active runtime.
- Edge case: if the selected session’s folder no longer exists, the runtime stays on the current session and surfaces a recoverable error.
- Edge case: if the selected session’s stored workspace path canonicalizes to an unexpected or invalid target, the resume attempt is rejected before relaunch.
- Edge case: switching from a visible populated session to another one resets transcript mirror state before hydration so rows are not duplicated.
- Error path: failed backend relaunch or failed session-load hydration does not orphan the current runtime or leave the TUI without an active backend client.
- Integration: after cross-workspace resume, the cwd display, git status, and future system-prompt context all reflect the resumed workspace.

**Verification:**
- Runtime switching preserves startup guarantees and restores the selected session without leaving mismatched workspace state behind.

---

### U5. Rehydrate resumed transcript state and reseed session-scoped globals

**Goal:** Rebuild the TUI’s transcript mirror and session-scoped global state after a resume so the new runtime and UI agree about the active session.

**Requirements:** R3, R6, R11, R13, R14

**Dependencies:** U3, U4

**Files:**
- Create: `tui/src/state/promptQueue/hydrateResumeTranscript.ts`
- Modify: `tui/src/state/promptQueue/atoms.ts`
- Modify: `tui/src/state/promptQueue/store.ts`
- Modify: `tui/src/state/global/index.ts`
- Modify: `tui/src/components/AppExitSummary/computeExitSummary.ts`
- Create: `tui/src/state/promptQueue/__tests__/hydrateResumeTranscript.test.ts`

**Approach:**
- Keep transcript restoration as a dedicated hydrate path rather than trying to fake a historical stream of live queue events through the existing reducer.
- Reseed conversation-scoped globals alongside transcript hydration: current workspace cwd, session start time, git baseline/exit-summary inputs, and the active durable session identity used by future runtime calls.
- Explicitly classify which values remain process-scoped (for example per-spawn debug-log correlation) versus conversation-scoped, so cross-workspace resume does not quietly preserve stale summary or diagnostics state.

**Patterns to follow:**
- `tui/src/state/promptQueue/atoms.ts`
- `tui/src/state/promptQueue/store.ts`
- `tui/src/backend/runtime/backendRuntime.ts`

**Test scenarios:**
- Happy path: hydrating a resumed session reconstructs the transcript mirror with correct prompt/response ordering and future live events append after the restored history instead of replacing it.
- Edge case: a resumed session with interrupted turns hydrates those rows deterministically without fabricating streamed token events.
- Edge case: cross-workspace resume reseeds session-scoped summary/baseline data so later exit summary calculations reflect the resumed session rather than the original process boot.
- Error path: malformed or incomplete stored transcript data fails hydration cleanly and leaves the pre-resume session view intact.
- Integration: the runtime switch, transcript hydration, and session-scoped global updates commit together from the user’s perspective.

**Verification:**
- After resume, the TUI state tree reflects one coherent active session instead of a mix of old process state and new transcript history.

---

### U6. Add the `/resume` surface, command entry, and picker state

**Goal:** Expose the new feature through a fullscreen picker that matches the screenshot-driven contract and stays aligned with existing TUI layout/surface patterns.

**Requirements:** R4, R5, R6, R7, R8, R9, R10, R11, R15, R16, R17

**Dependencies:** U3, U4, U5

**Files:**
- Modify: `tui/src/libs/commands/registry.ts`
- Modify: `tui/src/libs/commands/filterCommands.ts`
- Modify: `tui/src/libs/commands/executeCommand.ts`
- Modify: `tui/src/components/PromptComposer/index.tsx`
- Modify: `tui/src/App.tsx`
- Modify: `tui/src/state/ui/surface/atoms.ts`
- Modify: `tui/src/state/ui/surface/__tests__/atoms.test.ts`
- Create: `tui/src/state/ui/resume/atoms.ts`
- Create: `tui/src/state/ui/resume/index.ts`
- Create: `tui/src/state/ui/resume/__tests__/atoms.test.ts`
- Create: `tui/src/libs/resume/formatSessionRows.ts`
- Modify: `tui/src/libs/commands/__tests__/filterCommands.test.ts`
- Modify: `tui/src/libs/commands/__tests__/executeCommand.test.ts`
- Create: `tui/src/components/ResumeSurface/index.tsx`
- Create: `tui/src/components/ResumeSurface/ResumeRows.tsx`
- Create: `tui/src/components/ResumeSurface/useResumeInput.ts`
- Create: `tui/src/components/ResumeSurface/__tests__/ResumeSurface.test.tsx`

**Approach:**
- Add `/resume` to the existing client-side command registry, but treat execution as “open the fullscreen surface” rather than “perform the storage action in the command layer.”
- Mirror the `/model` surface structure: dedicated surface atoms, pure row-format helpers, fullscreen view, and input handling for navigation/selection/escape.
- Keep the table faithful to the approved screenshot shape while removing the `Type` column and all top tabs; the rows should display only the required local-only columns.
- Route blocker/error states into the surface instead of the bottom composer so resume-specific issues (`loading-list`, blocked active turn, `resume-failed`, empty list, missing folder, relaunch failure) are visible in the picker context.
- Keep wire data raw until the pure formatting helper stage; display numbers, clipped folder labels, and column layout should be TUI formatting concerns rather than transport concerns.
- Lock down a width strategy in the helper/state layer: rows stay single-line; `#`, `Status`, `Modified`, and `Created` keep fixed/minimum widths; `Summary` truncates first, then `Folder`; no cell wraps vertically inside the table.
- Maintain safe width and bottom-layout constraints from `tui/AGENTS.md`; this fullscreen surface must not regress cursor placement or final-column rendering on return to `Home`.

**Patterns to follow:**
- `tui/src/components/ModelSurface/index.tsx`
- `tui/src/state/ui/model/atoms.ts`
- `tui/src/state/ui/surface/atoms.ts`
- `tui/src/libs/commands/registry.ts`

**Test scenarios:**
- Happy path: `/resume` appears in slash-command help/registry and opens a fullscreen picker with the required columns but no top tabs or `Type` column. Covers AE1 and AE4.
- Happy path: rows are rendered in modified-time order with display-only numbering and first-prompt summaries, never showing durable session ids. Covers AE1 and AE2.
- Happy path: the surface shows explicit loading and resuming states, disables repeat selection while `resuming`, and only closes after the handoff succeeds.
- Edge case: when there are no resumable sessions, the surface shows a clear empty-state message and exits cleanly with Esc.
- Edge case: when the active runtime session is a hidden draft, the table shows no `Current` row instead of inventing an empty placeholder.
- Edge case: when the active runtime session is a hidden draft, the surface explains why no `Current` row is visible.
- Edge case: narrow terminals truncate `Summary` and then `Folder` while preserving one-line rows and stable date/status columns.
- Error path: if resume is blocked because a turn is active/pending, the picker surfaces the block state without losing the current session.
- Integration: choosing a row triggers the runtime resume orchestration and closes the picker only after the switch succeeds. Covers AE3.

**Verification:**
- The user can discover and operate `/resume` entirely through the TUI without seeing implementation identifiers or remote-session affordances.

---

### U7. Lock down end-to-end resume behavior and docs

**Goal:** Add targeted end-to-end coverage and update directly related documentation so the first shipped resume path stays reviewable and stable.

**Requirements:** R1-R17

**Dependencies:** U1, U2, U3, U4, U5, U6

**Files:**
- Modify: `tests/common/rpc.rs`
- Create: `tests/session_resume.rs`
- Modify: `tests/message_submit.rs`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/features/r054_session_list_resume_continue_delete_rename_and_title.md`

**Approach:**
- Add focused integration coverage at the Rust and TUI seams rather than relying only on unit tests: first-prompt visibility, same-session continuation, cross-workspace resume, and `/clear` rollover are all behavior-rich enough to deserve end-to-end protection.
- Extend the Rust JSON-RPC test harness as needed so cross-workspace resume scenarios can launch the backend under different cwd values instead of assuming repo-root execution for every contract test.
- Keep documentation updates narrowly scoped to user-visible local resume behavior and the current v1 limits so docs do not imply rename/delete/remote support prematurely.
- Use the broader `r054` feature doc as the durable spec touchpoint for what portion is now implemented first.

**Patterns to follow:**
- `tests/message_submit.rs`
- `README.md`
- `docs/features/r054_session_list_resume_continue_delete_rename_and_title.md`

**Test scenarios:**
- Happy path: create two stored sessions across different workspaces, restart KQode, and verify `/resume` lists both with correct ordering, summaries, statuses, and folders. Covers AE1 and AE2.
- Happy path: resume the older session, continue chatting, restart again, and verify the same durable session now sorts to the top. Covers AE3.
- Edge case: after `/clear`, the old session remains resumable while the new hidden draft session stays absent until its first prompt.
- Error path: attempting to resume during an active/pending turn leaves the current session intact and reports the block clearly.
- Error path: a crash or forced restart around first-write, active-turn interruption, or `/clear` rollover does not produce partially visible sessions or duplicate restored turns.
- Integration: cross-workspace resume updates backend cwd-sensitive behavior (git status / cwd display) along with transcript restoration.

**Verification:**
- The shipped feature is covered by deterministic tests at the contract and runtime boundaries, and the docs accurately describe the v1 local-only resume experience.

---

## System-Wide Impact

- **Interaction graph:** the change crosses SQLite migrations/store methods, backend conversation lifecycle, JSON-RPC contracts, runtime relaunch orchestration, and fullscreen TUI surface state.
- **Error propagation:** resume/load/store failures should surface as typed backend/runtime errors that keep the current session intact rather than silently dropping the user into a partial switch; preflight validation, ready-state confirmation, and hydration must fail as one coordinated flow.
- **State lifecycle risks:** durable session identity, hidden draft session rollover, interrupted-turn persistence, atomic first-write boundaries, and cross-workspace backend relaunch are the main places partial state can drift if ownership is split incorrectly.
- **API surface parity:** Rust and TypeScript protocol contracts must stay mirrored for new session list/load methods just like provider/message APIs do today.
- **Integration coverage:** same-session continuation after restart, `/clear` rollover, and cross-workspace resume all need tests that span store + backend + runtime rather than pure unit tests.
- **Unchanged invariants:** provider-selection storage, ready-notification debug logging, and existing slash-command surfaces (`/help`, `/login`, `/model`) should keep their current semantics while `/resume` is added beside them.
- **Process-scoped vs conversation-scoped state:** cross-workspace resume must deliberately reclassify which globals travel with the resumed conversation (cwd, transcript, exit-summary baseline) and which stay tied to the live process (per-spawn debug-log correlation).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Editing shipped migration history breaks backend startup on existing installs | Use a new forward-only migration, extend store bootstrap/upgrade tests, and preserve fail-closed sanity checks. |
| Durable session id accidentally reuses the debug/log `sessionId` | Treat the two identities as separate fields/contracts from the first implementation unit onward. |
| Cross-workspace resume leaves cwd-sensitive behavior stale | Centralize resume switching in the runtime layer, keep spawning composition-root owned, and verify cwd, git status, transcript hydration, and session-scoped globals together. |
| First-submit or resume writes become partially visible | Use atomic write boundaries, explicit integrity constraints, and failure-injection tests around first-write, append, and rollover paths. |
| `/clear` rollover or interrupted-turn persistence regresses current queue behavior | Add characterization/integration coverage around queue ordering, clear semantics, interrupted-turn restoration, and resumed-turn state before refactoring lifecycle code. |
| Durable prompts and workspace paths outlive user expectations | Document that `/clear` is rollover rather than delete, keep empty drafts non-persisted, and update user-facing docs about what local session data remains on disk. |
| Fullscreen picker layout regresses TUI stability | Follow existing surface patterns, keep render helpers pure, and add picker rendering tests that enforce the approved table shape. |

---

## Documentation / Operational Notes

- Update user-facing docs only for the behavior that v1 actually ships: local-only `/resume`, screenshot-shaped table, hidden empty sessions, and first-prompt summaries.
- Keep broader session-management roadmap items in feature docs rather than implying they are already available in the CLI.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-07-08-local-session-resume-requirements.md](../brainstorms/2026-07-08-local-session-resume-requirements.md)
- Related code: `src/store/mod.rs`, `src/store/providers.rs`, `src/conversation/state.rs`, `src/protocol/mod.rs`, `tui/src/backend/runtime/backendRuntime.ts`, `tui/src/components/ModelSurface/index.tsx`
- Related docs: `docs/research/2026-06-26-session-resume-storage-patterns.md`, `docs/features/r054_session_list_resume_continue_delete_rename_and_title.md`, `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
