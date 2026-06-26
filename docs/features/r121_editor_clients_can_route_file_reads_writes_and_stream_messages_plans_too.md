# R121. Editor clients can route file reads/writes and stream messages, plans, tool calls, approvals, and commands

**Category:** IDE, protocol, and ecosystem integrations
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#ide-protocol-and-ecosystem-integrations)
**Build phase:** M10
**Primary owner:** Protocol layer and future TypeScript adapters

## Intent

This feature ensures KQode can deliver: Editor clients can route file reads/writes and stream messages, plans, tool calls, approvals, and commands.
Within the `IDE, protocol, and ecosystem integrations` area, its focus is ACP/IDE clients, GitHub automation, chat connectors, desktop/mobile surfaces, and gateway integration.

## What to build

- Implement the smallest user-visible behavior that satisfies R121.
- Connect the behavior to the responsible KQode core surface: Protocol layer and future TypeScript adapters.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Design core protocol events so future clients reuse the same sessions, approvals, and VFS semantics.
- Route all file effects through VFS staging, diff preview, approval, and trace events.
- Route process execution through sandbox-lite with cwd, timeout, env scrub, output cap, and policy checks.

## Acceptance evidence

- A test or demo shows the proposed change before it is applied.
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
