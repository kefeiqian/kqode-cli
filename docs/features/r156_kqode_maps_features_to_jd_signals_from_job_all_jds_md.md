# R156. KQode maps features to JD signals from `job/all-jds.md`

**Category:** Portfolio and scope boundaries
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#portfolio-and-scope-boundaries)
**Build phase:** M9
**Primary owner:** Docs, README, eval reports, and demo artifacts

## Intent

This feature ensures KQode can deliver: KQode maps features to JD signals from `job/all-jds.md`.
Within the `Portfolio and scope boundaries` area, its focus is interview proof, JD mapping, scope control, and artifact quality.

## What to build

- Implement the smallest user-visible behavior that satisfies R156.
- Connect the behavior to the responsible KQode core surface: Docs, README, eval reports, and demo artifacts.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Turn implemented features into evidence: trace, diff, checks, report, and demo walkthrough.
- Define the user-visible behavior first, then connect it to the smallest Rust core primitive that supports it.

## Acceptance evidence

- A focused test or demo proves the feature without relying on unrelated capabilities.
- The implementation is documented in the relevant build-path milestone.

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
