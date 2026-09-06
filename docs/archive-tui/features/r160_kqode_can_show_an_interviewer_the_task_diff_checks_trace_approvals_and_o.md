# R160. KQode can show an interviewer the task, diff, checks, trace, approvals, and outcome

**Category:** Portfolio and scope boundaries
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#portfolio-and-scope-boundaries)
**Build phase:** M9
**Primary owner:** Docs, README, eval reports, and demo artifacts

## Intent

This feature ensures KQode can deliver: KQode can show an interviewer the task, diff, checks, trace, approvals, and outcome.
Within the `Portfolio and scope boundaries` area, its focus is interview proof, JD mapping, scope control, and artifact quality.

## What to build

- Implement the smallest user-visible behavior that satisfies R160.
- Connect the behavior to the responsible KQode core surface: Docs, README, eval reports, and demo artifacts.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Turn implemented features into evidence: trace, diff, checks, report, and demo walkthrough.
- Route all file effects through VFS staging, diff preview, approval, and trace events.
- Persist event data in append-only JSONL and index it for session list, replay, and reports.

## Acceptance evidence

- A test or demo shows the proposed change before it is applied.
- A denied or approval-required action is recorded and surfaced to the user.
- The session trace can prove the feature occurred.

## Trace and evaluation

- Add trace events or metadata that prove the feature happened during a run.
- If the feature affects safety, context, tools, replay, or eval, add a deterministic non-LLM test first.
- If the feature is user-facing, include it in a local demo or golden task once the supporting milestone exists.

## Related docs

- [KQode build path](../kqode_build_path.md)
- [KQode architecture spec](../kqode_architecture_spec.md)
- [KQode core implementation details](../kqode_core_implementation_details.md)
- [KQode platform implementation details](../kqode_platform_implementation_details.md)
- [KQode evaluation spec](../kqode_evaluation_spec.md)
