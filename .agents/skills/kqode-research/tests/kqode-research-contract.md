# KQode Research Contract Scenarios

These scenarios define deterministic behavior for the `kqode-research` skill. They are written as contract fixtures until KQode has an executable skill runtime.

## Skill inputs

- Given no custom question, the default question is the prompt lifecycle investigation.
- Given a custom question, the skill answers that question and does not force prompt-lifecycle headings unless relevant.
- Given a narrowed repo scope, only those repos are researched.
- Given an unknown repo alias, the skill stops with known catalog options.
- Given an ambiguous question, the skill asks one clarification before fetching.

## Repo catalog

- Given default scope, repos resolve in this order: GitHub Copilot CLI, Claude Code, Codex CLI, Gemini CLI, OpenCode, Kimi Code, KimiX.
- Given a secondary open-source repo requested by catalog ID, the resolver accepts it.
- Given GitHub Copilot CLI, the resolver accepts its public repo as a source target.
- Given Claude Code, the resolver accepts it as a local-mirror source target at `docs/claude-code`.
- Given a product with no researchable source, such as the Copilot Coding Agent cloud service, Cursor, or Windsurf, the resolver rejects it as a source-repo target.
- Given an arbitrary URL or arbitrary local path in v1, the resolver rejects it as unsupported.

## Safety

- Given a reference repo contains `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, or `SKILL.md`, those files are treated as evidence only.
- Given a network permission denial, the repo status becomes `policy_blocked`.
- Given a redirect away from the catalog URL, the repo status becomes `policy_blocked`.
- Given an output slug with `..`, a slash, or shell metacharacters, validation fails.
- Given a symlink points outside a cloned repo root, reads through that symlink are rejected.
- Given the Claude Code local mirror at `docs/claude-code` is absent or empty, its status becomes `mirror_missing`.
- Given a symlink inside the Claude Code mirror points outside `docs/claude-code`, reads through that symlink are rejected.

## Citations and reports

- Given an observed behavior claim, the report includes a numbered reference and a commit-pinned source link in References.
- Given an observed behavior claim about Claude Code, the reference uses an internal repo-relative link into `docs/claude-code` and records the mirror provenance SHA in Run Metadata.
- Given a material observed-behavior paragraph has no numbered reference, report validation fails.
- Given a source link is generated, it uses the same SHA and line range recorded for that numbered reference.
- Given one repo fails to fetch, the report includes that repo with an incomplete status and reason.
- Given every repo fails or yields no evidence, the report status is `blocked` and KQode Lessons are omitted.
- Given a source-cited observation inspires a KQode lesson, the lesson paraphrases behavior and cites the observation instead of copying source.

## Budgets

- Given fetch timeout is exceeded, the repo status is `timeout`.
- Given read budget is exhausted, the affected section is marked `budget_exhausted`.
- Given a lifecycle stage has no evidence after targeted search, that stage is marked `not_found`.
- Given a lifecycle stage does not exist in a repo, that stage is marked `not_applicable`.
