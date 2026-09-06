# R118. Remote triggers and proactive wait/sleep workflows as deferred features

**Category:** Runtime, workspace, and automation
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#runtime-workspace-and-automation)
**Build phase:** M10 unless marked local-first
**Primary owner:** Rust runtime/workspace layer

## Intent

This feature ensures KQode can deliver: Remote triggers and proactive wait/sleep workflows as deferred features.
Within the `Runtime, workspace, and automation` area, its focus is workspace abstraction, background tasks, lifecycle hooks, and automation entrypoints.

## What to build

- Implement the smallest user-visible behavior that satisfies R118.
- Connect the behavior to the responsible KQode core surface: Rust runtime/workspace layer.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Keep local VFS plus sandbox-lite as the primary runtime; defer remote/cloud surfaces until core behavior is proven.
- Mark this as an explicit deferred capability in roadmap and avoid coupling first-scope code to it.
- Add only the interface seam or data model needed to avoid future rewrites.

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
