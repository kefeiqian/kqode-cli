---
name: kqode-release-split-decision
description: "Record a KQode release-split decision from any branch or worktree. Use during PR review or extraction when a technical decision, queue-boundary change, ordering change, or future-PR instruction must be saved into the active docs/release/vX.Y.Z-pr-queue.md ledger on the control branch."
---

# KQode Release Split Decision

Record release-split decisions into the active queue ledger from any branch or worktree without mutating the current PR branch.

## Inputs

Use the user's prompt as the decision text. Identify:

- the release, for example `v0.2.0`;
- the affected PR number or queue item, if any;
- whether the decision changes queue order, PR boundaries, extraction behavior, validation, cleanup, or future-release closeout.

If the decision text is missing or too vague to record, ask one focused question before editing.

## Workflow

### 1. Find the active ledger

First check the current checkout:

```bash
find docs/release -maxdepth 1 -name 'v*-pr-queue.md' -print 2>/dev/null
```

If no ledger exists in the current checkout, search remote control branches:

```bash
git fetch origin --prune
git branch -r --list 'origin/chore/*release-split-ledger'
```

For `vX.Y.Z`, expect:

```text
origin/chore/vX.Y.Z-release-split-ledger
docs/release/vX.Y.Z-pr-queue.md
```

If multiple ledgers or control branches match and the user did not specify a release, ask which release to update.

### 2. Use the control checkout

Never edit the ledger in a feature or PR extraction worktree. Use the control branch checkout:

1. If the current branch is the matching `chore/vX.Y.Z-release-split-ledger`, use it.
2. Else inspect worktrees:

   ```bash
   git worktree list --porcelain
   ```

3. If a worktree for `chore/vX.Y.Z-release-split-ledger` already exists, use that path.
4. Otherwise create one outside the repo root:

   ```bash
   git worktree add ../KQode.release-split-ledger-vX.Y.Z \
     chore/vX.Y.Z-release-split-ledger
   ```

If only `origin/chore/vX.Y.Z-release-split-ledger` exists locally, create the local branch from it:

```bash
git worktree add ../KQode.release-split-ledger-vX.Y.Z \
  -b chore/vX.Y.Z-release-split-ledger origin/chore/vX.Y.Z-release-split-ledger
```

### 3. Update the ledger

Edit only `docs/release/vX.Y.Z-pr-queue.md`.

Always add a row under `## Queue Changes`:

```md
| YYYY-MM-DD | <decision summary> | <approval source> | <affected queue items and exact instruction> |
```

Also update the affected queue item outline when the decision applies to future extraction:

- **Extraction notes** for hunk ownership, final-state rules, branch naming, or validation.
- **Folded fixes and docs ownership** for review fixes or docs assignment.
- **Dependencies** when queue order changes.
- **Validation** when a new required check is added.
- The live queue row when status, branch, base SHA, PR URL, or validation changes.

If the decision changes queue order or PR boundaries, make every downstream dependency update in the same ledger edit. If you cannot confidently update dependencies, stop and report the unresolved dependency impact.

### 4. Commit and push from the control checkout

Use explicit pathspecs:

```bash
git add docs/release/vX.Y.Z-pr-queue.md
git commit -m "docs(release): record split decision" -- docs/release/vX.Y.Z-pr-queue.md
git push
```

Include the standard commit trailers required by the repository instructions.

### 5. Report the saved decision

Report:

- control branch and commit hash;
- ledger path;
- queue items touched;
- whether future queue extraction must read a new decision before proceeding.

## Rules

- Do not mutate the current PR worktree except for read-only inspection.
- Do not edit plan documents for execution decisions; use the queue ledger.
- Do not silently change queue order or PR boundaries without an explicit approval note.
- Do not create or push tags, version bumps, or release branches.
- Do not use `git add .`; stage only the ledger path.
