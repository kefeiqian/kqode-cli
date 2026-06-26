# R42. Approval modes: read-only, plan-only, supervised, auto, and full-access-style operation

**Category:** Safety, permissions, and sandbox
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#safety-permissions-and-sandbox)
**Build phase:** M3
**Primary owner:** Rust kqode-policy, kqode-vfs, and kqode-sandbox

## Intent

This feature ensures KQode can deliver: Approval modes: read-only, plan-only, supervised, auto, and full-access-style operation.
Within the `Safety, permissions, and sandbox` area, its focus is approval gates, policy decisions, path safety, and process-side sandbox-lite controls.

## What to build

- Implement the smallest user-visible behavior that satisfies R42.
- Connect the behavior to the responsible KQode core surface: Rust kqode-policy, kqode-vfs, and kqode-sandbox.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Centralize safety decisions so TUI, headless mode, and future protocol surfaces share the same behavior.
- Define the user-visible behavior first, then connect it to the smallest Rust core primitive that supports it.

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
