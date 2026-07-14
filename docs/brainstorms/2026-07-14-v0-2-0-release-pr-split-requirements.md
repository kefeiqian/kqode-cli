---
date: 2026-07-14
topic: v0-2-0-release-pr-split
---

# v0.2.0 Release PR Split

## Summary

Create a v0.2.0 release-splitting workflow that freezes the current branch as `release/v0.2.0`, then turns its 335-commit delta from `origin/main` into a rolling queue of main-based feature PRs. The queue is ordered by dependency, reviewed one PR at a time, and grouped by logical feature or infrastructure unit rather than by fixed size caps.

---

## Problem Frame

The current release-candidate branch, `feat/tui-composer-scroll`, contains hundreds of commits spanning backend persistence, provider setup, TUI interaction surfaces, session resume, memory, rendering, evaluation, and late-cycle fixes. Reviewing that branch as one PR would hide feature boundaries and make manual review impractical.

Opening every extracted branch immediately would also work against the review goal. Later PRs would either include prerequisite diffs, target non-main bases, or need repeated updates as earlier PRs land. The release split needs to preserve the full candidate branch while making each reviewable unit land cleanly onto `main` in order.

---

## Key Decisions

- **Snapshot first, then split.** Create `release/v0.2.0` from the current branch before carving feature PRs, so the full release candidate remains recoverable while individual PRs are reconstructed.
- **Use independent main-based PRs, not stacked PRs.** Each review PR targets `main` so GitHub review shows one standalone feature diff.
- **Use a rolling queue.** Open the first PR against current `origin/main`; after it merges, recreate or update the next branch against the new main.
- **Let logical cohesion outrank size.** A PR may be large when splitting it would create broken intermediate states or misleading review boundaries.
- **Treat plans as references, not boundaries.** Existing brainstorms and plans help name the work, but the actual commit history and file changes decide PR grouping.

---

## Requirements

**Release branch setup**

- R1. The workflow creates `release/v0.2.0` from the current `feat/tui-composer-scroll` head before any extraction work begins.
- R2. The release snapshot is non-destructive: if `release/v0.2.0` already exists locally or remotely, the workflow stops for an explicit decision instead of overwriting it.
- R3. The workflow does not push a release tag, publish artifacts, bump to v0.2.0, or trigger release automation.

**PR branch model**

- R4. Each feature PR branch is based on the current `main` at the time that PR is prepared.
- R5. Only one queue item is opened for review at a time unless the items are proven independent and conflict-free.
- R6. Each PR contains one logical feature, infrastructure unit, or tightly coupled fix set.
- R7. Supporting docs, tests, and review-fix commits travel with the feature they explain or protect.
- R8. Cross-cutting fixes are folded into the earliest parent PR that introduces the affected behavior.
- R9. Commits that mix unrelated concerns are reconstructed with hunk-level selection instead of being cherry-picked wholesale when clean extraction matters.

**Review order**

- R10. The queue starts with the bootstrap work needed by later branches, then lands foundational infrastructure before user-facing features that depend on it.
- R11. The queue prefers conflict-minimizing order over chronological order when the two diverge.
- R12. Later PRs are updated after earlier PRs merge so reviewers do not see duplicated prerequisite diffs.
- R13. A PR description names its feature boundary, representative commits, dependency assumptions, and any intentionally folded fixes.

**Manual review quality**

- R14. PRs are not split just to satisfy a line-count target; they are split only when the resulting branches remain coherent and buildable.
- R15. The first bootstrap PR explicitly calls out that it is mixed because the earliest numbered WIP commits cross feature boundaries.
- R16. The queue map remains editable as extraction exposes conflicts, mixed commits, or better feature seams.

---

## Proposed Rolling PR Queue

This queue is the starting map for the release split. Each item should be prepared only after its dependencies have merged into `main`, unless it is marked independent.

| # | Branch | PR title | Boundary | Depends on |
|---|---|---|---|---|
| 01 | `feat/v0.2.0-tui-composer-scroll-bootstrap` | `feat: TUI composer scroll, backend core, and git-status foundation` | Early bootstrap: composer scroll state, backend core, protocol/client foundation, git status, and weak-message WIP commits. | None |
| 02 | `ci/v0.2.0-winget-dispatch-only` | `ci(release): make winget publish a manual workflow` | Independent CI release workflow adjustment. | None |
| 03 | `fix/v0.2.0-xtask-parallel-safe` | `fix(xtask): isolate cargo xtask build directory and add TUI dev launchers` | Parallel-safe xtask invocation, IDE profiles, and TUI dev launchers. | 01 |
| 04 | `feat/v0.2.0-session-logging` | `feat(logs): per-session backend and TUI debug logging` | Backend/TUI session logging and lifecycle trace files. | 01 |
| 05 | `feat/v0.2.0-persistence-keychain-migrations` | `feat(store): SQLite persistence, OS keychain secrets, and hardened refinery migrations` | Store bootstrap, keychain storage, refinery migrations, and fail-closed startup behavior. | 01 |
| 06 | `feat/v0.2.0-provider-management` | `feat(provider): generalized client, JSON-RPC methods, and keychain-only config` | Provider abstraction, provider/model JSON-RPC, key validation, and removal of workspace `.env` credentials. | 05 |
| 07 | `feat/v0.2.0-queue-lifecycle-conversation` | `feat(protocol): queue lifecycle contract, transcript coordinator, and composer submit ring` | Queue lifecycle, transcript coordinator, conversation clear/cancel, and submit recall. | 01 |
| 08 | `feat/v0.2.0-tui-provider-surfaces` | `feat(tui): /connect, /model provider surfaces, masked key entry, and status-bar label` | Provider configuration UI and submit rerouting. | 05, 06, 07 |
| 09 | `fix/v0.2.0-tui-safe-rendering` | `fix(tui): safe rendering canvas, CJK display-column measurement, and wheel scroll smoothness` | Rendering canvas, display-width correctness, edge rows, and wheel batching. | 01 |
| 10 | `feat/v0.2.0-clipboard-primitives` | `feat(tui): clipboard seam, composer paste, right-click paste, and Ctrl+O copy` | Clipboard abstraction and initial copy/paste behavior. | 07, 08 |
| 11 | `feat/v0.2.0-session-resume` | `feat(session): local session resume, docked resume picker, and --resume boot flag` | Session resume, resume picker, exit-card resume row, and resume IDs. | 05, 07 |
| 12 | `feat/v0.2.0-conversation-history-compaction` | `feat(chat): full conversation history with token-budgeted auto-compaction` | Full-history prompt assembly, token budgeting, compaction, and resume persistence. | 05, 07, 11 |
| 13 | `feat/v0.2.0-local-memory-system` | `feat(memory): local memory system with corpus, index, service, TUI surface, and scheduler` | Local memory corpus, SQLite index, backend protocol, TUI surface, prompt loading, and inbox lifecycle. | 05, 07, 08 |
| 14 | `feat/v0.2.0-theme-system` | `feat(tui): built-in theme catalog, SQLite persistence, live picker, and Tokyo Night default` | Theme catalog, theme persistence, picker, packaging notices, and default theme. | 05, 08 |
| 15 | `feat/v0.2.0-tui-markdown-rendering` | `feat(tui): markdown transcript rendering with blocks, tables, links, and code highlighting` | Markdown transcript rendering pipeline and syntax highlighting. | 07, 09 |
| 16 | `feat/v0.2.0-slash-subcommands-memory-tui` | `feat(tui): slash subcommand model with /memory create, edit, and forget flows` | Slash subcommands and memory-management forms. | 13, 15 |
| 17 | `refactor/v0.2.0-docked-popup-infrastructure` | `refactor(tui): docked CommandSurface shell, unified popup row budget, and selection primitives` | Shared docked popup shell and unified command-surface chrome. | 08, 13, 14 |
| 18 | `feat/v0.2.0-session-summary-title` | `feat(session): LLM session summary generation and live terminal title` | Summary generation, persisted titles, and terminal-title updates. | 06, 11, 17 |
| 19 | `feat/v0.2.0-in-app-transcript-selection` | `feat(tui): in-app transcript selection with mouse drag, mode-less selection, and keyboard copy` | Transcript selection, copy reconstruction, mode-less mouse behavior, and keyboard copy. | 10, 15, 17 |
| 20 | `feat/v0.2.0-latex-math-rendering` | `feat(tui): LaTeX to Unicode math conversion in the transcript pipeline` | LaTeX symbol maps and Unicode math rendering. | 15 |
| 21 | `feat/v0.2.0-system-prompt-engine` | `feat(chat): ordered system-prompt section engine with AGENTS.md ingest` | System-prompt fragment registry and project-instruction ingestion. | 12 |
| 22 | `feat/v0.2.0-eval-baseline` | `feat(eval): EvalPlus benchmark runner, headless one-shot mode, and eval CLI` | Headless one-shot path, deterministic provider controls, EvalPlus grader, metrics, and eval CLI. | 06, 21 |
| 23 | `feat/v0.2.0-ctrl-c-turn-stop` | `feat: Ctrl+C interrupts a streaming turn` | `Ctrl+C` turn-stop behavior and backend/TUI stop seam. | 07 |
| 24 | `fix/v0.2.0-late-tui-polish` | `fix(tui): late-cycle polish, input refactors, and miscellaneous hardening` | Remaining polish, research updates, input refactors, and fixes not folded earlier. | Prior queue |

---

## Acceptance Examples

- AE1. **Covers R1, R3.** Given the current branch is `feat/tui-composer-scroll`, when branch setup runs, then `release/v0.2.0` points at the current head and no `v0.2.0` tag or release workflow is triggered.
- AE2. **Covers R4, R5, R12.** Given PR 01 has merged, when PR 03 is prepared, then its branch is based on the updated `main` and does not include PR 01's already-merged diff.
- AE3. **Covers R6, R7, R8.** Given a review-fix commit only protects provider credential handling, when provider-management extraction runs, then that fix is folded into the provider PR rather than becoming a standalone cleanup PR.
- AE4. **Covers R9, R15.** Given an early numbered commit mixes backend foundation, TUI state, docs, and dependency changes, when clean extraction would require risky history surgery, then the bootstrap PR includes it and the PR description names the mixed boundary.
- AE5. **Covers R14, R16.** Given a candidate PR is large but forms one coherent refactor, when splitting would require landing a broken intermediate UI state, then the queue keeps it as one PR and records the reason.

---

## Success Criteria

- The release candidate remains preserved in `release/v0.2.0`.
- Each opened PR targets `main`, has one clear review boundary, and avoids showing already-merged prerequisite changes.
- The queue can be reviewed manually in order without reviewers needing to understand a stacked branch graph.
- The first PR explains the unavoidable bootstrap mixing; later PRs minimize mixed concerns through folding or hunk-level reconstruction.
- The final merged sequence reproduces the release candidate's intended v0.2.0 behavior without triggering release publication.

---

## Scope Boundaries

- No version bump to `0.2.0` during branch setup.
- No tag push, GitHub Release, npm publish, Homebrew publish, or winget publish.
- No automatic opening of all PRs at once.
- No promise that every original commit remains intact; the split may reconstruct changes when that improves review quality.
- No fixed maximum line count, commit count, or file count per PR.

---

## Dependencies / Assumptions

- `origin/main` is the review target and was at `045069a` (`ci(release): use KefeiQian.KQode as the winget package identifier`) during this brainstorm.
- The current branch was `feat/tui-composer-scroll` and was 335 commits ahead of `origin/main` during this brainstorm.
- No local or remote `release/v0.2.0` branch was visible when checked.
- The repository's contribution guide expects branches to start from `main`, pull requests to focus on one concern, and commit messages to follow Conventional Commits (`CONTRIBUTING.md`).
- Release automation is tag-driven by `v*` pushes (`.github/workflows/release.yml`), so branch preparation must avoid tag creation.
- Version synchronization is available through `cargo xtask set-version <X.Y.Z>` (`xtask/src/commands/set_version.rs`), but release branch setup does not use it.

---

## Sources / Research

- `CONTRIBUTING.md` for branch, PR-focus, and Conventional Commit guidance.
- `.github/workflows/release.yml` for tag-driven release automation.
- `xtask/src/commands/set_version.rs` for version synchronization behavior.
- Git metadata for `feat/tui-composer-scroll`, `origin/main`, and the `origin/main..HEAD` commit range.
