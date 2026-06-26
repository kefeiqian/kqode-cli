# R19. Core tools: read, write, patch, list, glob, search, shell, test, git, ask-user, web fetch/search, and complete-task

**Category:** Tools and editing
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#tools-and-editing)
**Build phase:** M1-M3
**Primary owner:** Rust kqode-tools, kqode-vfs, and kqode-policy

## Intent

This feature ensures KQode can deliver: Core tools: read, write, patch, list, glob, search, shell, test, git, ask-user, web fetch/search, and complete-task.
Within the `Tools and editing` area, its focus is safe tool execution, staged edits, patching, and git-aware change review.

## What to build

- Implement the smallest user-visible behavior that satisfies R19.
- Connect the behavior to the responsible KQode core surface: Rust kqode-tools, kqode-vfs, and kqode-policy.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Route every tool through typed schemas, policy decisions, trace events, and recoverable errors.
- Route all file effects through VFS staging, diff preview, approval, and trace events.
- Route process execution through sandbox-lite with cwd, timeout, env scrub, output cap, and policy checks.
- Define task-level success criteria and capture pass/fail, runtime, cost, trace path, and failure category.

## Acceptance evidence

- A test or demo shows the proposed change before it is applied.
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
