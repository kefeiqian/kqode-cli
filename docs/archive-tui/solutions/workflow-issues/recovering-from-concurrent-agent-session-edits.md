---
title: "Recovering from concurrent agent-session edits to the same files"
date: 2026-07-04
category: workflow-issues
module: development-workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
resolution_type: workflow_improvement
applies_when:
  - "multiple agent or IDE sessions may edit the same files at the same time"
  - "landing a refactor, rename, or migration across several overlapping files"
  - "file mtimes or git status show writes you did not make"
related_components:
  - tui
  - ink-tui
tags:
  - concurrent-edits
  - session-collision
  - development-workflow
  - git
  - verification
  - ink-tui
---

# Recovering from concurrent agent-session edits to the same files

## Context

KQode's active feature branch is edited by more than one session at a time — parallel
Copilot CLI/agent sessions and the IDE all share one uncommitted working tree. During a
behavior-preserving refactor of the Ink TUI prompt composer
(`tui/src/components/PromptComposer/`), another session was simultaneously running its own
refactor over the *same* files (moving `ArmedAction` to an enum in `@constants/ui.ts`,
relocating `exactCommandMatch` to `matchCommand.ts`, deleting `commandMenuInput.ts`). A batch
of blind string-replace edits interleaved with that session's writes and left the working tree
half-migrated and uncompilable.

(session history) The collision is corroborated by the session store: parallel sessions
"Refactor Magic Strings to Constants" and "Adjust Prompt Composer Row Limit" were active in the
same minutes, editing the composer/constants area — that "magic strings to constants" work is
the `ArmedAction` enum change that collided here. (auto memory) A stored repo fact already
warned that the active branch "may have concurrent committers (other agent/IDE sessions);
re-verify HEAD immediately before `git commit --amend`/rebase."

## Guidance

Treat "another session may be writing these files right now" as a real, checkable state — not a
rare edge case — on shared branches.

1. **Detect activity before and during edits.** Probe file modification times and `git status`.
   You (the agent) know which writes are yours, so any write you did not make in a window is a
   concurrent session.
   ```powershell
   Get-ChildItem -Recurse tui/src -Include *.ts,*.tsx |
     Sort-Object LastWriteTime -Descending | Select-Object -First 6 |
     Format-Table @{ n = 't'; e = { $_.LastWriteTime.ToString('HH:mm:ss') } }, Name
   ```
2. **Wait for a quiet window, then a green build.** Run a background "settle watcher" that only
   reports back once no source file has changed for N seconds *and* the typecheck passes — poll
   mtimes until idle for e.g. 90s, then run the typecheck and report GREEN only on exit 0. Do not
   start editing on "it was stable a few minutes ago" — re-verify mtimes **immediately** before a
   batch of edits.
3. **On collision, STOP — do not fight it.**
   - Do **not** keep editing; interleaved writes make it worse.
   - Do **not** revert your partial edits while the other session is active: writing your
     now-stale copy over their newer content corrupts *their* work. Reverting is more dangerous
     than leaving your residue, which they may simply overwrite.
   - Escalate to the human to **serialize** the sessions (pause one), rather than racing.
4. **After the other session lands, rebuild on their structure.** Re-establish a quiet window,
   then **re-read every target file fresh** — the other session may have renamed symbols, moved
   modules, or changed enums. Re-apply your change on top of the landed structure, not the version
   you remember.
5. **Verify the rebuild** with the project's own gates: typecheck, targeted tests, and a residue
   grep proving none of the old shape survived.
   ```bash
   # from tui/
   bun run typecheck && bun run test
   ```

## Why This Matters

- **Partial application is silently destructive.** Batch string-replace edits apply per-hunk; when
  files change under you, some hunks match and some do not, leaving a tree that mixes two
  incompatible refactors and does not compile.
- **Stale reverts corrupt the other session.** Once a concurrent session has rewritten a file, your
  remembered version is stale; writing it back overwrites their newer work.
- **Racing wastes both sessions' effort.** Serializing (pause one, finish, then the other) is faster
  than two agents overwriting each other.
- **Memory is not the tree.** After a collision you cannot reason about file contents from memory —
  the only safe source of truth is a fresh read.

## When to Apply

- Shared or uncommitted branches where multiple agent or IDE sessions may be open.
- Any multi-file batch edit (refactor, rename, migration) — the blast radius for interleaving is
  largest here.
- When mtimes or `git status` show writes you did not make.

## Examples

**Failure mode (what didn't work):** a single response issued ~12 blind `edit` (string-replace)
calls across 8 files. Several returned "No match found" because a concurrent session had already
changed those files' imports/enums; the rest applied — producing handlers that used a new
`ctx.store` shape against a `types.ts` still on the old `actions`-bag shape. The tree no longer
typechecked.

**Detection that worked:** re-reading the "failed" files showed symbols never written by this
session (`ArmedAction` enum imported from `@constants/ui.ts`); an mtime probe then showed all six
handler files rewritten *after* this session's last edit while it had only been reading — proving
an active concurrent session.

**Recovery that worked:** stop → report and ask the human to confirm the other session was done →
re-read all eight files fresh to capture the landed structure (enum + moved module) → re-apply the
change cleanly (full rewrite of the two contract files, targeted edits to the two half-migrated
handlers, leave the four already-correct ones) → `bun run typecheck` green, `bun run test`
251 passed, residue grep clean.

## Related

- `docs/solutions/architecture-patterns/state-libs-layering-and-cycle-verification-in-the-ink-tui.md`
  — TUI refactor verification (typecheck / cycle checks); moderate overlap on the *verify* step,
  but does not cover concurrent-session collisions.
- `docs/solutions/architecture-patterns/backend-process-lifecycle-ownership-in-the-ink-tui.md`
  — TUI ownership boundaries; moderate overlap on prevention framing only.
- Repo memory: the active branch "may have concurrent committers … re-verify HEAD before
  amend/rebase."
