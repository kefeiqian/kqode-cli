---
date: 2026-07-12
topic: brainstorms-and-plans-shipped-audit
type: audit
---

# Shipped-Status Audit: brainstorms and plans

Snapshot of what has and has not shipped across `docs/brainstorms/` (33 docs) and
`docs/plans/` (31 docs), as of 2026-07-12.

## Headline

**30 of 33 brainstorms are shipped.** Three are not: one large foundational slice
(the agent loop / tool-use), one never-planned feature, and one intentionally deferred
feature. The standout gap is the agent-loop / tool-use slice — the milestone that turns
KQode from a conversational chat agent into a code-editing agent. The other two gaps are
downstream of it.

## Method (and why plan `status:` was not trusted)

The plan `status:` frontmatter is **unreliable** as a ship signal, so ship state was
verified against code + git history, not frontmatter:

- Some plans marked `status: active` are actually shipped and live in code
  (`2026-06-30-001` LLM provider, `2026-07-07-001` refinery store).
- Three plans have **no `status:` line at all** but shipped
  (`2026-06-25-001` research skill, `2026-07-07-002` ink-safe rendering, `2026-07-07-003` theme command).
- Two brainstorms shipped with **no plan doc** (`theme-catalog-ten-popular-themes` shipped
  directly; `interactive-user-question-window` never built).

## ❌ Not shipped

### 1. Context-intent retrieval planning — the big one
- Brainstorm: `docs/brainstorms/2026-06-25-context-intent-retrieval-planning-requirements.md`
- Plan: `docs/plans/2026-06-25-002-feat-context-intent-retrieval-planning-plan.md` (`status: active`)
- **State: not built.** This is the foundational agent loop: layered first-LLM-call packet,
  evidence-backed retrieval plan, read-only discovery loop, tool registry, and side-effect gate.
- Evidence: `src/` has no `tools`, `vfs`, `sandbox`, `policy`, or `retrieval` modules, and zero
  `tool_call` / `read_file` / `apply_patch` references. `src/chat/` is a streaming chat loop only.
  KQode can converse but cannot yet read or edit files as an agent.

### 2. Interactive user-question window
- Brainstorm: `docs/brainstorms/2026-07-09-interactive-user-question-window-requirements.md`
- Plan: **none written.**
- **State: not built.** Zero `Question`-window matches in `tui/src/`.

### 3. TUI clipboard image paste — intentionally deferred
- Brainstorm: `docs/brainstorms/2026-07-12-tui-clipboard-image-paste-requirements.md` (`status: deferred`)
- Plan: **none written.**
- **State: deferred by design.** Blocked on a file-read / VFS tool, which is gap #1.

## ⚠️ Bookkeeping caveat (not a real gap)

- **Command-surface visual consistency** is split across two plans. The shell refactor
  (`2026-07-11-005`, `completed`) landed, and the grammar-unification plan
  (`2026-07-11-003`, `status: active`) has its "unify selection" commits landed too — its
  `active` status looks stale rather than indicating unshipped work.

## Full brainstorm → plan → ship-state map

| Brainstorm (docs/brainstorms/) | Plan (docs/plans/) | Plan status | Ship state |
| --- | --- | --- | --- |
| 2026-06-25-context-intent-retrieval-planning | 2026-06-25-002 | active | ❌ not shipped |
| 2026-06-25-first-ink-tui-homepage | 2026-06-25-003 | completed | ✅ shipped |
| 2026-06-25-kqode-research-skill | 2026-06-25-001 | (none) | ✅ shipped |
| 2026-06-29-gemini-style-tui-theming | 2026-06-29-001 | completed | ✅ shipped |
| 2026-06-30-llm-provider-streaming-chat | 2026-06-30-001 | active | ✅ shipped (stale status) |
| 2026-07-01-tui-exit-summary-card | 2026-07-01-001 | completed | ✅ shipped |
| 2026-07-03-tui-slash-command-system | 2026-07-03-001 | completed | ✅ shipped |
| 2026-07-04-tui-composer-height-cap-and-scroll | 2026-07-04-001 | completed | ✅ shipped |
| 2026-07-05-backend-owned-transcript-queue-and-prompt-recall | 2026-07-05-003 | completed | ✅ shipped |
| 2026-07-05-per-session-tui-and-backend-debug-logs | 2026-07-05-001 | completed | ✅ shipped |
| 2026-07-05-provider-login-and-model-selection | 2026-07-05-002 | completed | ✅ shipped |
| 2026-07-05-tui-copy-paste-and-selection | 2026-07-05-004 | completed | ✅ shipped |
| 2026-07-06-db-migrations-refinery-and-fail-closed-store | 2026-07-07-001 | active | ✅ shipped (stale status) |
| 2026-07-07-theme-command | 2026-07-07-003 | (none) | ✅ shipped |
| 2026-07-07-tui-drop-bottom-guard-row | 2026-07-07-004 | completed | ✅ shipped |
| 2026-07-07-tui-ink-safe-rendering | 2026-07-07-002 | (none) | ✅ shipped |
| 2026-07-08-local-session-resume | 2026-07-08-001 | completed | ✅ shipped |
| 2026-07-09-conversation-history-and-auto-compaction | 2026-07-09-001 | completed | ✅ shipped |
| 2026-07-09-interactive-user-question-window | (none) | — | ❌ not shipped |
| 2026-07-09-local-memory-system | 2026-07-09-002 | completed | ✅ shipped |
| 2026-07-10-connect-and-model-loop | 2026-07-10-005 | completed | ✅ shipped |
| 2026-07-10-remove-env-provider-config | 2026-07-10-003 | completed | ✅ shipped |
| 2026-07-10-resume-picker-bottom-dock | 2026-07-10-002 | completed | ✅ shipped |
| 2026-07-10-slash-subcommand-autocomplete | 2026-07-10-001 | completed | ✅ shipped |
| 2026-07-10-tui-command-surface-half-height-cap | 2026-07-10-007 | completed | ✅ shipped |
| 2026-07-10-tui-markdown-rendering | 2026-07-10-004 | completed | ✅ shipped |
| 2026-07-10-xtask-parallel-safe-invocation | 2026-07-10-006 | completed | ✅ shipped |
| 2026-07-11-exit-card-resume-command | 2026-07-11-002 | completed | ✅ shipped |
| 2026-07-11-llm-session-summary-and-title | 2026-07-11-004 | completed | ✅ shipped |
| 2026-07-11-tui-command-surface-visual-consistency | 2026-07-11-003 + 005 | active + completed | ✅ shipped (003 status stale) |
| 2026-07-11-tui-copy-paste-roundtrip-fidelity | 2026-07-11-001 | completed | ✅ shipped |
| 2026-07-12-theme-catalog-ten-popular-themes | (none) | — | ✅ shipped directly (commit 5c4111b8) |
| 2026-07-12-tui-clipboard-image-paste | (none) | deferred | ❌ deferred |

## Optional frontmatter cleanup (bookkeeping, not shipping work)

- Mark `2026-06-30-001` and `2026-07-07-001` as `completed` (both shipped, still say `active`).
- Add `status: completed` to `2026-06-25-001`, `2026-07-07-002`, `2026-07-07-003` (no status line).
- Reconcile `2026-07-11-003` status vs. its landed commits.
- Add the missing `origin:` link on `2026-07-11-001` → `2026-07-11-tui-copy-paste-roundtrip-fidelity`.
