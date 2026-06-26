# R106. Named multi-agent teams with persistent state as a deferred feature

**Category:** Multi-agent and swarm
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#multi-agent-and-swarm)
**Build phase:** M8
**Primary owner:** Rust kqode-core child sessions and TypeScript TUI navigation

## Intent

This feature ensures KQode can deliver: Named multi-agent teams with persistent state as a deferred feature.
Within the `Multi-agent and swarm` area, its focus is subagents, delegation, result consolidation, and budgeted parallelism.

## What to build

- Implement the smallest user-visible behavior that satisfies R106.
- Connect the behavior to the responsible KQode core surface: Rust kqode-core child sessions and TypeScript TUI navigation.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Model every subagent as a child session with its own trace, policy, budget, and parent linkage.
- Mark this as an explicit deferred capability in roadmap and avoid coupling first-scope code to it.
- Add only the interface seam or data model needed to avoid future rewrites.
- Represent agent work as session-scoped state with budgets, ownership, and parent/child trace linkage.

## Acceptance evidence

- The roadmap names the capability, its trigger, and the prerequisite milestone.
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
