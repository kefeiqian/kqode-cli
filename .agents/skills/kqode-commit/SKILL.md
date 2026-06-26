---
name: kqode-commit
description: "Create clear KQode git commits from the current working tree on the current branch. Use when the user asks to commit or save changes. Categorizes changed files by content and creates multiple logical commits when the diff contains distinct concerns instead of forcing one single commit."
---

# KQode Commit

Create clear git commits from the current working tree. Prefer multiple logical commits when the changed files represent distinct concerns.

## Context

Gather the current git context before staging anything:

```bash
printf '=== STATUS ===\n'
git status --short
printf '\n=== DIFF ===\n'
git diff HEAD
printf '\n=== BRANCH ===\n'
git branch --show-current
printf '\n=== LOG ===\n'
git log --oneline -10
printf '\n=== DEFAULT_BRANCH ===\n'
git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo '__DEFAULT_BRANCH_UNRESOLVED__'
```

If the working tree is clean, report that there is nothing to commit and stop.

## Workflow

### 1. Confirm branch context

Do not create, switch, or rename branches as part of this skill. Commit on the current branch reported by `git branch --show-current`, including `main`, `master`, or the resolved default branch.

If the current branch is empty, stop and ask the user what branch to use before committing.

### 2. Determine commit convention

Use this priority order:

1. Follow repository instructions if they define commit message conventions.
2. Match a clear recent-commit pattern from `git log --oneline -10`.
3. Otherwise use conventional commits: `type(scope): description`.

Use the most specific type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`, or `build`.

### 3. Categorize files into logical commit groups

Before staging, inspect all changed files and group them by content and intent.

Create multiple commits when the diff has distinct concerns, such as:

- Product or feature code separate from documentation.
- Tests or fixtures that belong to a specific feature group.
- Independent docs, skill, config, or cleanup changes.
- Generated or lockfile changes tied to only one dependency/config change.
- Unrelated fixes discovered while implementing the main task.

Keep grouping at the file level. Do not split hunks inside a file unless the user explicitly asks for that.

Prefer two or three meaningful commits over one large mixed commit when the content naturally separates. Use one commit when the changes are tightly coupled or grouping would be ambiguous.

### 4. Stage and commit each group

Stage specific files for each group. Avoid `git add .` and `git add -A` so unrelated or sensitive files are not accidentally included.

Use an imperative subject focused on value. Add a body only when the change needs rationale, tradeoffs, or review context.

Include the standard trailer unless the user explicitly asked not to:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

Example:

```bash
git add path/to/file1 path/to/file2 && git commit -m "$(cat <<'EOF'
type(scope): describe the value

Explain why this logical group belongs together when the subject is not enough.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

### 5. Confirm result

After committing, run:

```bash
git status --short
git log --oneline -5
```

Report each commit hash and subject. If any files remain uncommitted, explain whether they were intentionally left out and why.
