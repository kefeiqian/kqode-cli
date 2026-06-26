# R41. Advanced code RAG, vector retrieval, knowledge-base RAG, and GraphRAG remain optional later proof-of-depth features

**Category:** Context engineering and memory
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#context-engineering-and-memory)
**Build phase:** M6
**Primary owner:** Rust context builder and session/memory store

## Intent

This feature ensures KQode can deliver: Advanced code RAG, vector retrieval, knowledge-base RAG, and GraphRAG remain optional later proof-of-depth features.
Within the `Context engineering and memory` area, its focus is bounded context, project instructions, active working set, and inspectable memory.

## What to build

- Implement the smallest user-visible behavior that satisfies R41.
- Connect the behavior to the responsible KQode core surface: Rust context builder and session/memory store.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Represent every context item as a bounded fragment with source, priority, token estimate, and trace citation.
- Mark this as an explicit deferred capability in roadmap and avoid coupling first-scope code to it.
- Add only the interface seam or data model needed to avoid future rewrites.
- Define task-level success criteria and capture pass/fail, runtime, cost, trace path, and failure category.

## Acceptance evidence

- The roadmap names the capability, its trigger, and the prerequisite milestone.
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
