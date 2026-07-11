---
date: 2026-07-11
topic: exit-card-resume-command
---

# Exit Card Resume Command

## Summary

Fill in the exit summary card's already-scaffolded **Resume** row so that, on exit from a genuinely resumable session, KQode prints a copy-pasteable `kqode --resume=<id>` command — and add a real `kqode --resume=<id>` CLI entry that boots straight back into that session. The row appears only when the session actually has something to resume.

---

## Problem Frame

When the KQode TUI exits, the card recaps Changes and Duration but stops there. A user who was mid-conversation and quits has no breadcrumb back to that exact session: to continue, they must relaunch KQode, open `/resume`, and re-find the row by recency and summary. Mature terminal agents (e.g. GitHub Copilot CLI) close a session by printing the exact one-line command that reopens it, turning "continue where I left off" into a single copy-paste.

KQode already anticipated this — the exit card reserves a `Resume` row, and the store already knows which sessions are resumable — but the row renders nothing and there is no shell-level command to reopen a specific session. The gap is a broken promise in the card and a missing shortcut at the shell.

---

## Actors

- A1. User: Quits the TUI, reads the card, and later pastes `kqode --resume=<id>` at the shell to reopen that exact session.
- A2. Ink TUI: Knows the attached session id and whether it is resumable; renders the Resume row on exit and, at launch, honors `--resume=<id>` by reopening that session instead of starting fresh.
- A3. Rust backend + local session store: Owns session identity and the resumable set (first accepted submit), and performs the resume-by-id restore. The authoritative source of "is this session resumable."
- A4. Shell: Where the printed command is read and where `kqode --resume=<id>` is invoked.

---

## Key Flows

- F1. Resume command shown on exit
  - **Trigger:** The user quits the TUI.
  - **Actors:** A1, A2, A3
  - **Steps:** The TUI holds the id of the session attached to the runtime and whether it is resumable; on the clean-exit path it assembles the card; if the session is resumable it includes a Resume row reading `kqode --resume=<id>`, otherwise it omits the row; the card prints into restored scrollback.
  - **Outcome:** The user sees a copy-pasteable resume command exactly when there is something to resume.
  - **Escape path:** Non-TTY exit, unknown/unavailable id, or a non-resumable session → the row is omitted and the exit is otherwise unchanged.
  - **Covered by:** R1, R2, R3, R4, R5, R7

- F2. Reopen a session by id from the shell
  - **Trigger:** The user runs `kqode --resume=<id>`.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** `kqode` launches, resolves the id against the local store, switches into the session's original folder, restores its transcript, and continues as that same session.
  - **Outcome:** The session reopens in one step, equivalent to selecting it in `/resume`.
  - **Escape path:** Unknown or unresumable id → a clear error, not a silent unrelated fresh session.
  - **Covered by:** R8, R9, R10, R11

---

## Requirements

**Exit card Resume row**
- R1. On exit from a resumable session (F1), the exit card includes a Resume row showing the exact shell command to reopen that session.
- R2. The Resume row renders `kqode --resume=<id>`, where `<id>` is the full stable id of the session attached at exit, in the same labeled-row style as the existing Changes/Duration rows. The full id is shown because the command must be complete enough to paste and run.
- R3. When the session is not resumable, the Resume row is omitted entirely (consistent with how empty rows are already dropped), leaving the card identical to today's Changes/Duration-only card.
- R4. The Resume row inherits the card's existing constraints: it prints only on the clean-exit path to a TTY, degrades with the card in narrow terminals, and never turns shutdown into an error if the id is unavailable.

Illustrative layout (art not final):

```
 [KQode]   Changes   +12 −4
 [emblem]  Duration  2m 5s
           Resume    kqode --resume=2c7f6ff5-9e14-4e6f-aa85-7b3591df4b97
```

**Resumability (the "valid session" gate)**
- R5. "Resumable" means the current session would appear in `/resume` — it has at least one accepted turn (its first accepted submit has been recorded). This is the single shared definition; `/resume` and the exit card must never disagree about it.
- R6. A session opened via resume (`/resume` or `kqode --resume=<id>`) is resumable from the start of that run; exiting it shows the Resume row.
- R7. The id shown is the session currently attached to the runtime at exit, including after a mid-run resume or a workspace relaunch — not necessarily the id the process first started with.

**`kqode --resume=<id>` CLI entry**
- R8. `kqode --resume=<id>` launches the TUI and reopens the identified session directly — restoring its transcript and switching into its original workspace folder — without the user opening the `/resume` picker.
- R9. Resuming by id continues the existing session record rather than creating a replacement, matching `/resume` (no duplicate session).
- R10. `kqode` with no `--resume` continues to start a fresh session exactly as today; `--resume` is additive and optional.
- R11. When `--resume=<id>` names an unknown or unresumable id, KQode surfaces a clear error and does not silently start an unrelated fresh session.

**Reconciliation with the picker**
- R12. The `/resume` picker continues to not display raw session ids; the exit card's Resume command is the only surface that reveals a raw id, as a deliberate copy-paste convenience.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R5.** Given a session with at least one accepted turn, when the user quits, then the card shows a Resume row reading `kqode --resume=<id>` with that session's id.
- AE2. **Covers R3, R5.** Given a session that was opened but never had an accepted turn (quit immediately, or the only submit was rejected because no provider was connected), when the user quits, then no Resume row appears and the card matches today's Changes/Duration-only card.
- AE3. **Covers R6, R7.** Given the user resumed session X (via the picker or `--resume`) and then quits, when the card renders, then the Resume row shows `kqode --resume=X`.
- AE4. **Covers R8, R9.** Given a valid id X for a session created in a different folder, when the user runs `kqode --resume=X`, then KQode opens in X's folder, restores X's transcript, and continues X without creating a duplicate.
- AE5. **Covers R11.** Given an unknown id, when the user runs `kqode --resume=<unknown>`, then KQode reports a clear error and does not silently start an unrelated fresh session.

---

## Success Criteria

- A user who quits mid-work can copy one line from the exit card and reopen the exact session later, without remembering an id or hunting through `/resume`.
- The Resume row appears only when the command will actually work — a user never sees a resume command that then fails.
- A planner can implement both the CLI entry and the card row without inventing what "resumable" means, what the command looks like, or how a bad id behaves.

---

## Scope Boundaries

- No change to the `/resume` picker's columns or its deliberate hiding of raw session ids.
- No clipboard auto-copy of the resume command on exit.
- No Cost or Tokens row work — those remain placeholders from a separate milestone.
- No remote/cloud session resume; `--resume` is local-only, matching `/resume`.
- No bare `--resume` "reopen most recent without an id" shortcut in this scope.
- No LLM-generated session titles or summary changes.

---

## Key Decisions

- Make the printed command real (new `--resume=<id>` CLI entry) over display-only parity: a resume command that doesn't work is worse than no row at all.
- Gate the row on genuine resumability (≥1 accepted turn = the `/resume` set), not "any prompt submitted," so the printed command is guaranteed to work.
- Reveal the raw session id only at exit as a copy-paste convenience while keeping the `/resume` picker id-free — the two surfaces serve different purposes, so the earlier "no raw ids" decision stands for the picker.
- Reuse the existing resume path (session list/resume, cross-workspace folder switch) for `--resume=<id>` rather than building a parallel mechanism.
- A bad id fails loudly (clear error) rather than silently starting an unrelated fresh session.

---

## Dependencies / Assumptions

- Depends on the store's existing "resumable = first accepted submit" definition (`src/store/sessions.rs`, `list_resumable_sessions`) and the `kqode.session.resume` API (`src/backend/sessions.rs`) — both already implemented and used by `/resume`.
- Assumes the TUI can learn the current session's id and resumability at exit. Today the backend announces a session id on ready (`tui/src/backend/runtime/backendRuntime.ts`) and resume returns the id, but "is the current session resumable" is not yet surfaced to the exit-summary state — planning must choose the signal.
- Builds on the existing exit card, which already reserves a `Resume` row that currently renders nothing (`tui/src/components/AppExitSummary/formatExitSummaryCard.ts`), plus its TTY-only / clean-exit / narrow-terminal behavior.
- Assumes `kqode` is the invoked binary name (`tui/src/constants/product.ts`, `CLI_NAME`) so the printed command matches how users launch it; the CLI today exposes only `--debug` (`tui/src/cli/kqodeCli.tsx`), so `--resume` is a genuinely new flag.
- Reconciles the original Resume-row intent (`docs/brainstorms/2026-07-01-tui-exit-summary-card-requirements.md`, R8) with the `/resume` "no raw ids" decision (`docs/brainstorms/2026-07-08-local-session-resume-requirements.md`, R8/R15).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5, R7][Technical] How the TUI learns whether the current session is resumable (and its current id) at exit — `session.list` membership check, a dedicated "current session resumable" flag, or a backend signal on first accepted submit.
- [Affects R8][Technical] Where in the launch sequence `--resume=<id>` resumes (before first render vs. immediately after) so the transcript hydrates cleanly while reusing the existing resume-into-runtime path.
- [Affects R11][User decision → defaulted] Precise bad-id behavior: hard error with non-zero exit vs. error-then-fall-back to a fresh session or the picker. Defaulted to "clear error, no silent unrelated session"; confirm the exact fallback and messaging during planning.
