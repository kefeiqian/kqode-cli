# KQode Research Workflow

This workflow answers a research question by inspecting source evidence from selected reference repositories. It produces one combined report and never executes reference code.

## Phase 1: Clarify and scope

1. Identify the research question.
2. If no question is supplied, use the default prompt-lifecycle question from `../SKILL.md`.
3. Resolve the repo set from `repo-catalog.md`.
4. Reject unsupported repo targets before any fetch.
5. Create an output slug using `safety-and-citations.md`.

Ask one clarifying question when the research question is too broad to guide file selection.

## Phase 2: Fetch and pin source

For each selected git repo:

1. Resolve the cache path as `~/.kqode/research/repos/<repo-id>`.
2. If the cache does not exist, clone the catalog HTTPS URL without submodules or Git LFS payloads.
3. If the cache exists, verify it is a Git checkout whose `origin` matches the catalog repository. Fail closed on mismatch instead of replacing or reusing it.
4. Resolve the upstream default branch, then fetch and prune `origin` on every invocation. Do not treat an existing checkout as current without fetching.
5. Check out the fetched default-branch HEAD as a detached commit. Do not merge, rebase, or preserve a local research branch.
6. Record requested URL, resolved URL, branch, SHA, fetch timestamp, cache path, and fetch status.
7. Treat the checkout as untrusted read-only data during research.

Use non-interactive anonymous Git access with credential helpers disabled. Do not initialize submodules, execute hooks, or fetch Git LFS content. A synchronization failure affects that repo only; record its incomplete status and continue with other selected repos.

## Phase 3: Search and read evidence

Use search before broad reads. Prefer targeted file ranges over full-file reads.

Default per-repo budgets:

- Fetch timeout: 5 minutes.
- Search timeout: 2 minutes per query family.
- Read budget: 30 targeted files or 12,000 source lines, whichever comes first.
- Search hit budget: 100 hits before narrowing terms.
- Generated/vendor/build paths are excluded unless the research question specifically targets them.

Ignore these paths by default: `.git`, `node_modules`, `target`, `dist`, `build`, `vendor`, `.venv`, `__pycache__`, `coverage`, `.next`, `.cache`, `tmp`, and generated lockfile-heavy directories.

When a budget is exhausted, mark the affected repo or lifecycle stage as incomplete with reason `budget_exhausted`.

## Phase 4: Default prompt-lifecycle checklist

For the default question, seek evidence for:

| Stage | Evidence to find |
|---|---|
| Prompt ingestion | CLI/TUI/API entrypoint that receives user text |
| Context assembly | Project instructions, memory, repo map, file reads, retrieval, or prompt construction |
| Model call | Provider abstraction, request shape, streaming path, retry or fallback behavior |
| Tool loop | Tool-call parsing, validation, execution, result shape, and continuation |
| Edit/apply path | Patch, file write, diff, approval, or git-aware editing behavior |
| Safety gates | Permissions, sandboxing, policy checks, network gates, or destructive-action handling |
| Session output | Trace, transcript, replay, resume, cost, metrics, or final summary artifacts |

Use `not_applicable` when a repo does not implement a stage. Use `not_found` only after targeted searches fail.

## Phase 5: Custom research questions

For custom questions:

1. Translate the question into 3-6 search themes.
2. Search each selected repo for theme-specific entrypoints.
3. Read the smallest source ranges needed to support material claims.
4. Compare only the repos and dimensions that have evidence.
5. Keep unrelated prompt-lifecycle sections out of the report unless they answer the question.

## Phase 6: Synthesize

Write findings in this order:

1. Per-repo observed behavior with numbered references.
2. Cross-repo comparison.
3. Evidence gaps and confidence notes.
4. KQode lessons.

KQode lessons should be categorized as:

- Product behavior.
- Architecture implication.
- Evaluation idea.
- Risk or tradeoff.

Every lesson must name why it matters for KQode and point back to the observed evidence that supports it using numbered references.

## Terminal states

| Status | Meaning |
|---|---|
| `complete` | All selected repos were fetched and the question was answered with cited evidence. |
| `partial` | At least one selected repo or stage is incomplete, but material evidence exists. |
| `blocked` | No selected repo produced material evidence, or safety policy prevents the run. |
| `cancelled` | The user stopped the run. |

If status is `blocked`, write a blocked/no-evidence report and do not write KQode recommendations.
