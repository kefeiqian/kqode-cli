# R143. Deterministic contract tests for parser, tool, policy, and non-LLM behavior

**Category:** Observability and evaluation
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#observability-and-evaluation)
**Build phase:** M9
**Primary owner:** Rust kqode-session and kqode-eval

## Intent

This feature ensures KQode can deliver: Deterministic contract tests for parser, tool, policy, and non-LLM behavior.
Within the `Observability and evaluation` area, its focus is traces, metrics, badcases, eval tasks, replay fidelity, and public benchmark evidence.

## What to build

- Implement the smallest user-visible behavior that satisfies R143.
- Connect the behavior to the responsible KQode core surface: Rust kqode-session and kqode-eval.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Make every run produce machine-readable metrics and human-readable evidence.
- Define task-level success criteria and capture pass/fail, runtime, cost, trace path, and failure category.

## Acceptance evidence

- A denied or approval-required action is recorded and surfaced to the user.
- The evaluation report includes success status and failure reason for this feature.
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
