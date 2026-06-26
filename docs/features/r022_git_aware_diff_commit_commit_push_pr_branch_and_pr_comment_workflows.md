# R22. Git-aware diff, commit, commit-push-PR, branch, and PR comment workflows

**Category:** Tools and editing
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#tools-and-editing)
**Build phase:** M1-M3
**Primary owner:** Rust kqode-tools, kqode-vfs, and kqode-policy

## Intent

This feature ensures KQode can deliver: Git-aware diff, commit, commit-push-PR, branch, and PR comment workflows.
Within the `Tools and editing` area, its focus is safe tool execution, staged edits, patching, and git-aware change review.

## What to build

- Implement the smallest user-visible behavior that satisfies R22.
- Connect the behavior to the responsible KQode core surface: Rust kqode-tools, kqode-vfs, and kqode-policy.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Route every tool through typed schemas, policy decisions, trace events, and recoverable errors.
- Route all file effects through VFS staging, diff preview, approval, and trace events.

## Acceptance evidence

- A test or demo shows the proposed change before it is applied.
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
