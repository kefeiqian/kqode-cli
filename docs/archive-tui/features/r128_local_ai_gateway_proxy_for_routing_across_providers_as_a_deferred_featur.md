# R128. Local AI gateway/proxy for routing across providers as a deferred feature

**Category:** IDE, protocol, and ecosystem integrations
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#ide-protocol-and-ecosystem-integrations)
**Build phase:** M10
**Primary owner:** Protocol layer and future TypeScript adapters

## Intent

This feature ensures KQode can deliver: Local AI gateway/proxy for routing across providers as a deferred feature.
Within the `IDE, protocol, and ecosystem integrations` area, its focus is ACP/IDE clients, GitHub automation, chat connectors, desktop/mobile surfaces, and gateway integration.

## What to build

- Implement the smallest user-visible behavior that satisfies R128.
- Connect the behavior to the responsible KQode core surface: Protocol layer and future TypeScript adapters.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Design core protocol events so future clients reuse the same sessions, approvals, and VFS semantics.
- Mark this as an explicit deferred capability in roadmap and avoid coupling first-scope code to it.
- Add only the interface seam or data model needed to avoid future rewrites.
- Expose provider behavior through normalized model metadata, streaming, errors, cost, and quota handling.

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
