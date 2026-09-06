# R11. Tool calling / Function Calling until completion, blockage, or clarification

**Category:** Agent harness
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#agent-harness)
**Build phase:** M1
**Primary owner:** Rust kqode-core

## Intent

This feature ensures KQode can deliver: Tool calling / Function Calling until completion, blockage, or clarification.
Within the `Agent harness` area, its focus is agent loop, task state, tool orchestration, and completion semantics.

## What to build

- Implement the smallest user-visible behavior that satisfies R11.
- Connect the behavior to the responsible KQode core surface: Rust kqode-core.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Implement the behavior in the core loop with fake-provider tests before connecting a real model.
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
