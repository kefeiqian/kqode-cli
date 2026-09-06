# R114. Lifecycle hooks for prompt submit, pre/post tool use, permission request/result, session start/end, subagent start/stop, compaction, interruption, and notification

**Category:** Runtime, workspace, and automation
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#runtime-workspace-and-automation)
**Build phase:** M10 unless marked local-first
**Primary owner:** Rust runtime/workspace layer

## Intent

This feature ensures KQode can deliver: Lifecycle hooks for prompt submit, pre/post tool use, permission request/result, session start/end, subagent start/stop, compaction, interruption, and notification.
Within the `Runtime, workspace, and automation` area, its focus is workspace abstraction, background tasks, lifecycle hooks, and automation entrypoints.

## What to build

- Implement the smallest user-visible behavior that satisfies R114.
- Connect the behavior to the responsible KQode core surface: Rust runtime/workspace layer.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Keep local VFS plus sandbox-lite as the primary runtime; defer remote/cloud surfaces until core behavior is proven.
- Persist event data in append-only JSONL and index it for session list, replay, and reports.
- Represent agent work as session-scoped state with budgets, ownership, and parent/child trace linkage.

## Acceptance evidence

- A denied or approval-required action is recorded and surfaced to the user.
- The session trace can prove the feature occurred.
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
