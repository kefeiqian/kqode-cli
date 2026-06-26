# R120. Editor clients can create, load, resume, prompt, cancel, list, and configure sessions

**Category:** IDE, protocol, and ecosystem integrations
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#ide-protocol-and-ecosystem-integrations)
**Build phase:** M10
**Primary owner:** Protocol layer and future TypeScript adapters

## Intent

This feature ensures KQode can deliver: Editor clients can create, load, resume, prompt, cancel, list, and configure sessions.
Within the `IDE, protocol, and ecosystem integrations` area, its focus is ACP/IDE clients, GitHub automation, chat connectors, desktop/mobile surfaces, and gateway integration.

## What to build

- Implement the smallest user-visible behavior that satisfies R120.
- Connect the behavior to the responsible KQode core surface: Protocol layer and future TypeScript adapters.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Design core protocol events so future clients reuse the same sessions, approvals, and VFS semantics.
- Route all file effects through VFS staging, diff preview, approval, and trace events.
- Persist event data in append-only JSONL and index it for session list, replay, and reports.

## Acceptance evidence

- A test or demo shows the proposed change before it is applied.
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
