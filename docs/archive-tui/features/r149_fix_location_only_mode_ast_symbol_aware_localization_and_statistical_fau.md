# R149. Fix-location-only mode, AST/symbol-aware localization, and statistical fault localization as deferred evaluation features

**Category:** Observability and evaluation
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#observability-and-evaluation)
**Build phase:** M9
**Primary owner:** Rust kqode-session and kqode-eval

## Intent

This feature ensures KQode can deliver: Fix-location-only mode, AST/symbol-aware localization, and statistical fault localization as deferred evaluation features.
Within the `Observability and evaluation` area, its focus is traces, metrics, badcases, eval tasks, replay fidelity, and public benchmark evidence.

## What to build

- Implement the smallest user-visible behavior that satisfies R149.
- Connect the behavior to the responsible KQode core surface: Rust kqode-session and kqode-eval.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Make every run produce machine-readable metrics and human-readable evidence.
- Mark this as an explicit deferred capability in roadmap and avoid coupling first-scope code to it.
- Add only the interface seam or data model needed to avoid future rewrites.
- Define task-level success criteria and capture pass/fail, runtime, cost, trace path, and failure category.

## Acceptance evidence

- The roadmap names the capability, its trigger, and the prerequisite milestone.
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
