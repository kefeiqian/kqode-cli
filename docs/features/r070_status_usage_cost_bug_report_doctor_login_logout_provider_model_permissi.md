# R70. Status, usage, cost, bug report, doctor, login, logout, provider, model, permissions, and settings commands

**Category:** CLI and TUI experience
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#cli-and-tui-experience)
**Build phase:** M5
**Primary owner:** Rust CLI and TypeScript Ink TUI

## Intent

This feature ensures KQode can deliver: Status, usage, cost, bug report, doctor, login, logout, provider, model, permissions, and settings commands.
Within the `CLI and TUI experience` area, its focus is terminal interaction, commands, display, navigation, and user control.

## What to build

- Implement the smallest user-visible behavior that satisfies R70.
- Connect the behavior to the responsible KQode core surface: Rust CLI and TypeScript Ink TUI.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Keep the TUI as a protocol client over the core rather than a place where business logic accumulates.
- Route process execution through sandbox-lite with cwd, timeout, env scrub, output cap, and policy checks.
- Expose provider behavior through normalized model metadata, streaming, errors, cost, and quota handling.
- Keep context bounded, source-cited, token-estimated, and visible in traces.

## Acceptance evidence

- A denied or approval-required action is recorded and surfaced to the user.
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
