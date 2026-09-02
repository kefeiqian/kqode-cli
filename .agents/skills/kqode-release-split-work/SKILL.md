---
name: kqode-release-split-work
description: "Continue approved KQode release-split work from docs/release/vX.Y.Z-pr-queue.md. Use after a queue PR merges or when asked to prepare the next PR: reads prior decisions, updates the ledger, creates a fresh main-based sibling worktree, extracts, validates, opens exactly one PR, and records status."
---

# KQode Release Split Work

Continue approved release-split work from its ledger. This skill is for operating the rolling PR queue after the release snapshot and plan already exist.

## Inputs

Use the user's prompt to identify the ledger path. Default to the only file matching:

```bash
docs/release/v*-pr-queue.md
```

For v0.2.0, the ledger is:

```bash
docs/release/v0.2.0-pr-queue.md
```

If multiple ledgers match and the user did not name one, ask which release to continue.

## Workflow

### 1. Start from the control branch

Confirm the current branch is the release-split control branch, not the frozen release-candidate branch:

```bash
git branch --show-current
git status --short --branch
```

For v0.2.0, continue from:

```text
chore/v0.2.0-release-split-ledger
```

If currently on `release/v*` or the frozen source branch, stop and switch to the control branch before editing the ledger.

### 2. Refresh remote state

```bash
git fetch origin --prune
```

Inspect open/merged queue PRs with `gh pr view` using the PR URLs in the ledger. If an open PR has not merged, do not prepare the next PR unless the ledger explicitly allows parallel review.

### 3. Mark merged PRs in the ledger

When a queue PR has merged:

1. Update its row status to `merged`.
2. Record the merge SHA in reviewer notes or the relevant outline.
3. Add a `Queue Changes` row with the merge event and next queue item.
4. Commit and push only the ledger update.

Use explicit pathspec commits:

```bash
git add docs/release/vX.Y.Z-pr-queue.md
git commit -m "docs(release): mark <queue item> merged" -- docs/release/vX.Y.Z-pr-queue.md
git push
```

### 4. Pick the next queue item

Choose the first `pending` item whose dependencies are all `merged`. If any dependency is still `open`, `pending`, or `blocked`, stop and report the blocker.

Mark the item `extracting` in the ledger before creating the branch, then commit and push that ledger update.

Before extraction, read every row under `## Queue Changes` plus the target item outline. If a decision affects the target item, copy it into the PR body's **Extraction notes**, **Folded fixes**, **Validation**, or **Queue approval** field as appropriate. If any applicable decision is not reflected in the target outline, update and commit the ledger first, then continue.

### 5. Create a fresh sibling worktree

Never extract directly in the control checkout. Create a sibling worktree from fresh `origin/main`:

```bash
mkdir -p ../KQode.release-split-worktrees
git worktree add ../KQode.release-split-worktrees/<queue-id>-<short-name> \
  -b <branch-from-ledger> origin/main
```

Use `release/vX.Y.Z` as the read-only source for cherry-picks, hunk extraction, and equivalence checks.

### 6. Extract the branch

Use the ledger outline:

- direct cherry-pick only when the source commit is clean for the boundary;
- hunk-split mixed commits when needed;
- fold docs/tests/review fixes into the earliest PR that introduces the behavior they protect;
- preserve migration ordering with the next contiguous migration version on current `main`;
- never add temporary behavior that a later PR removes.

For v0.2.0 PR02, the expected extraction is:

```bash
git cherry-pick 9cfe801
```

### 7. Validate before opening

Run checks appropriate to the touched files. For source/TUI changes, use the CI-equivalent bar:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo build --workspace --all-targets
cargo test --workspace
cargo xtask tui-typecheck
cargo xtask tui-test
```

For workflow/docs-only PRs, still run a focused validation such as diff review plus repository checks that are reasonably relevant. If a check is skipped, record why in the PR body and ledger.

Run a secret scan before pushing a branch created from the release snapshot:

```bash
gitleaks git . --log-opts='origin/main..HEAD' --redact --no-banner
```

### 8. Review, commit, push, and open one PR

Commit the extraction branch with focused commits. Run review before opening when the diff contains behavior changes; apply validated fixes before PR creation.

Before opening, verify the branch includes all existing ledger decisions that apply to the item. If a review finding creates a decision for future PRs, invoke `kqode-release-split-decision` (or manually update the control ledger) before opening the current PR.

Open exactly one ready-for-review PR:

```bash
git push -u origin <branch-from-ledger>
gh pr create --base main --head <branch-from-ledger> \
  --title "<title from ledger>" \
  --body-file <prepared-pr-body>
```

The PR body must include:

- Boundary
- Representative commits
- Dependencies
- Base SHA
- Folded fixes
- Extraction notes
- Validation
- Queue approval

### 9. Update and commit the ledger

After opening the PR:

1. Set the queue row status to `open`.
2. Fill base SHA, PR URL, validation, and reviewer notes.
3. Add a `Queue Changes` row.
4. Commit and push the ledger update on the control branch.
5. Stop. Do not start the next PR until this PR merges.

### 10. Close out after the final queue item

When every queue row is `merged`, do not delete branches immediately. First:

1. Compare final `main` against `release/vX.Y.Z` for production/tooling behavior equivalence.
2. Document intentional residual deltas in the ledger.
3. Run the project release workflow, usually by invoking `kqode-version-bump`.
4. Verify the GitHub Release and npm publishing completed when applicable.
5. Mark the ledger `closed` or add a final Queue Changes closeout row.

Only after the release is verified:

- remove local extraction worktrees;
- delete merged extraction branches locally and remotely;
- delete or archive `release/vX.Y.Z` only if explicitly approved;
- merge or archive the ledger somewhere durable;
- delete the control branch last.

## Rules

- Keep `release/vX.Y.Z` and the frozen source branch read-only.
- Keep all operational state in `docs/release/vX.Y.Z-pr-queue.md` on the control branch.
- Do not use the old source branch name as a PR function name.
- Do not open multiple PRs unless the ledger records explicit approval.
- Do not silently change queue order or PR boundaries; record approval first.
- Use explicit pathspecs for ledger commits so concurrent staged changes are not swept in.
- Keep the control ledger until the release is verified and cleanup is complete.
