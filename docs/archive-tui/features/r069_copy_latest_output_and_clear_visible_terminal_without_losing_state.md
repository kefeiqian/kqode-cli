# R69. Copy latest output and clear visible terminal without losing state

**Category:** CLI and TUI experience
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#cli-and-tui-experience)
**Build phase:** M5
**Primary owner:** Rust CLI and TypeScript Ink TUI

## Intent

This feature ensures KQode can deliver: Copy latest output and clear visible terminal without losing state.
Within the `CLI and TUI experience` area, its focus is terminal interaction, commands, display, navigation, and user control.

## What to build

- Implement the smallest user-visible behavior that satisfies R69.
- Connect the behavior to the responsible KQode core surface: Rust CLI and TypeScript Ink TUI.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Keep the TUI as a protocol client over the core rather than a place where business logic accumulates.
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
