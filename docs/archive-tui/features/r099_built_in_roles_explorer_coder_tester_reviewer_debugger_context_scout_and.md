# R99. Built-in roles: explorer, coder, tester, reviewer, debugger, context scout, and general worker

**Category:** Multi-agent and swarm
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#multi-agent-and-swarm)
**Build phase:** M8
**Primary owner:** Rust kqode-core child sessions and TypeScript TUI navigation

## Intent

This feature ensures KQode can deliver: Built-in roles: explorer, coder, tester, reviewer, debugger, context scout, and general worker.
Within the `Multi-agent and swarm` area, its focus is subagents, delegation, result consolidation, and budgeted parallelism.

## What to build

- Implement the smallest user-visible behavior that satisfies R99.
- Connect the behavior to the responsible KQode core surface: Rust kqode-core child sessions and TypeScript TUI navigation.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Model every subagent as a child session with its own trace, policy, budget, and parent linkage.
- Define task-level success criteria and capture pass/fail, runtime, cost, trace path, and failure category.
- Keep context bounded, source-cited, token-estimated, and visible in traces.

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
