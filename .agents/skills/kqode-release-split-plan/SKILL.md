---
name: kqode-release-split-plan
description: "Create or review a KQode release-split plan from a branch delta. Use when a large release-candidate branch must be frozen, scanned, and split into focused main-based PRs with a queue ledger, PR boundaries, migration ordering, and validation rules."
---

# KQode Release Split Plan

Create or review a release-split plan for turning a large release-candidate branch into a rolling queue of focused, main-based PRs.

## Inputs

Use the user's prompt to identify:

- the release-candidate branch, defaulting to the current branch when unspecified;
- the review base, defaulting to `origin/main`;
- the target release branch name, usually `release/vX.Y.Z`;
- any existing requirements, brainstorm, or plan file paths.

If the release branch name or candidate branch is ambiguous, ask one focused question before proceeding.

## Workflow

### 1. Gather branch facts

Run read-only git probes:

```bash
git branch --show-current
git rev-parse --verify origin/main
git rev-parse --verify HEAD
git log --reverse --format='%h%x09%s' origin/main..HEAD
git diff --name-status origin/main..HEAD
git branch --list release/v*
git ls-remote --heads origin 'release/v*'
git tag --list 'v*'
```

If a target release branch already exists locally or remotely, stop and ask for an explicit decision. Do not overwrite release refs.

### 2. Classify the delta

Group commits and changed files by feature, infrastructure unit, migration chain, workflow/documentation unit, and review-fix ownership.

Call out:

- weak or opaque commit messages that require hunk ownership;
- commits that mix unrelated concerns;
- migration files whose numbering must remain contiguous after splitting;
- provider credential or secret-storage changes that must land final-state only;
- docs/research/plan markers that need an owning PR instead of a catch-all.

### 3. Draft the rolling queue

Prefer one queue item per coherent feature, infrastructure unit, or tightly coupled fix set. Use function-oriented branch names:

```text
feat/vX.Y.Z-<function-name>
fix/vX.Y.Z-<function-name>
ci/vX.Y.Z-<function-name>
refactor/vX.Y.Z-<function-name>
```

Do not reuse the release-candidate source branch name as a PR function name when the branch contains many features.

For every queue item record:

- number, branch, title, boundary, dependencies;
- representative commits or ranges;
- expected file clusters;
- folded fixes/docs/tests;
- extraction notes, especially hunk-split commits;
- validation expected before opening.

### 4. Write or update artifacts

For a new split, create or update:

- `docs/brainstorms/<date>-<topic>-requirements.md` when requirements are missing;
- `docs/plans/<date>-001-<topic>-plan.md`;
- `docs/release/vX.Y.Z-pr-queue.md`.

Keep plan documents as decision artifacts. Put progress and operational state in the release queue ledger.

### 5. Include required gates

The plan must require:

- commit requirements, plan, and initial ledger before freezing;
- clean tracked worktree before creating the release branch;
- blocking secret scan before pushing a release snapshot branch;
- no `v*` tag, version bump, or release automation during split setup;
- one open PR at a time unless explicit approval changes the queue;
- fresh `origin/main` worktrees for every extraction PR;
- full CI-equivalent checks before opening each PR;
- final equivalence check after the queue lands.

### 6. Review before handoff

Before finishing, verify that the queue has no generic catch-all polish PR. Any leftover must be folded into a parent PR or listed as an explicit exact-item PR requiring approval.

## Rules

- Use release branches only as read-only snapshots after freeze.
- Use `origin/main` as the PR base unless the user explicitly changes the model.
- Do not preserve original commit boundaries when hunk-level extraction gives a cleaner review boundary.
- Do not plan temporary behavior that a later PR removes; every opened PR must represent final intended behavior for its boundary.
- Keep migration ordering forward-only and contiguous in every intermediate PR state.
