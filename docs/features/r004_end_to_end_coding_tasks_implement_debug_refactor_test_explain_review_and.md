# R4. End-to-end coding tasks: implement, debug, refactor, test, explain, review, and summarize

**Category:** Core product
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#core-product)
**Build phase:** M0-M5
**Primary owner:** Rust CLI and TypeScript TUI

## Intent

This feature ensures KQode can deliver: End-to-end coding tasks: implement, debug, refactor, test, explain, review, and summarize.
Within the `Core product` area, its focus is product behavior, user-facing workflow, and first demo quality.

## What to build

- Implement the smallest user-visible behavior that satisfies R4.
- Connect the behavior to the responsible KQode core surface: Rust CLI and TypeScript TUI.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Define the user-visible behavior first, then wire it to the Rust core through the shared event protocol.
- Define task-level success criteria and capture pass/fail, runtime, cost, trace path, and failure category.

## Acceptance evidence

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
