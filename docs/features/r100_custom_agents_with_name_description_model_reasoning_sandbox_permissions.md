# R100. Custom agents with name, description, model, reasoning, sandbox, permissions, max steps, and prompt body

**Category:** Multi-agent and swarm
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#multi-agent-and-swarm)
**Build phase:** M8
**Primary owner:** Rust kqode-core child sessions and TypeScript TUI navigation

## Intent

This feature ensures KQode can deliver: Custom agents with name, description, model, reasoning, sandbox, permissions, max steps, and prompt body.
Within the `Multi-agent and swarm` area, its focus is subagents, delegation, result consolidation, and budgeted parallelism.

## What to build

- Implement the smallest user-visible behavior that satisfies R100.
- Connect the behavior to the responsible KQode core surface: Rust kqode-core child sessions and TypeScript TUI navigation.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Model every subagent as a child session with its own trace, policy, budget, and parent linkage.
- Route process execution through sandbox-lite with cwd, timeout, env scrub, output cap, and policy checks.
- Expose provider behavior through normalized model metadata, streaming, errors, cost, and quota handling.
- Represent agent work as session-scoped state with budgets, ownership, and parent/child trace linkage.

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
