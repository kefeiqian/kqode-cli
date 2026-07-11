# KQode Research Reports

This directory stores durable, source-cited research reports about KQode's reference implementations.

Reports are produced by the local `kqode-research` skill at `.agents/skills/kqode-research/SKILL.md`. The default report investigates what happens after a user submits a prompt to the default-scope reference agents, but the skill also supports other research questions.

## Report rules

- Write one combined Markdown report per research question.
- Include the research question, selected repos, analyzed SHAs, repo statuses, observed findings, comparison, evidence gaps, and KQode lessons.
- Separate observed reference behavior from KQode recommendations.
- Cite material observed-behavior claims with commit-pinned citations, or internal repo-relative links for the git-ignored Claude Code mirror at `docs/claude-code`.
- Mark partial and blocked runs explicitly.
- Do not copy, vendor, or port source code from reference repositories.

## Storage rules

Keep only durable reports in this directory. Do not store cloned reference repositories, caches, scratch files, or generated dependency folders here.

If a repository-local cache fallback is needed during development, use `.kqode-research/`, which is ignored by git.

## Naming

Use:

```text
YYYY-MM-DD-<question-slug>.md
```

If a report already exists, create a numeric suffix or ask before overwriting.
