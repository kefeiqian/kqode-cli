# R95. Untrusted plugin confirmation, no install-time code execution, and plugin-root path constraints

**Category:** MCP, skills, plugins, and extensions
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#mcp-skills-plugins-and-extensions)
**Build phase:** M7
**Primary owner:** Rust kqode-mcp plus TypeScript plugin helpers

## Intent

This feature ensures KQode can deliver: Untrusted plugin confirmation, no install-time code execution, and plugin-root path constraints.
Within the `MCP, skills, plugins, and extensions` area, its focus is extensibility through MCP, Skills, plugin manifests, trust, and recipe workflows.

## What to build

- Implement the smallest user-visible behavior that satisfies R95.
- Connect the behavior to the responsible KQode core surface: Rust kqode-mcp plus TypeScript plugin helpers.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Start with local skills and stdio MCP, then expand transports and plugin distribution after the core is stable.
- Route process execution through sandbox-lite with cwd, timeout, env scrub, output cap, and policy checks.
- Keep extension loading explicit, inspectable, and permission-controlled before execution.

## Acceptance evidence

- A focused test or demo proves the feature without relying on unrelated capabilities.
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
