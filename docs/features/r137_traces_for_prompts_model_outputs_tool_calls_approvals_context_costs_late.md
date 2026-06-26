# R137. Traces for prompts, model outputs, tool calls, approvals, context, costs, latency, and outcomes

**Category:** Observability and evaluation
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#observability-and-evaluation)
**Build phase:** M9
**Primary owner:** Rust kqode-session and kqode-eval

## Intent

This feature ensures KQode can deliver: Traces for prompts, model outputs, tool calls, approvals, context, costs, latency, and outcomes.
Within the `Observability and evaluation` area, its focus is traces, metrics, badcases, eval tasks, replay fidelity, and public benchmark evidence.

## What to build

- Implement the smallest user-visible behavior that satisfies R137.
- Connect the behavior to the responsible KQode core surface: Rust kqode-session and kqode-eval.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Make every run produce machine-readable metrics and human-readable evidence.
- Persist event data in append-only JSONL and index it for session list, replay, and reports.
- Expose provider behavior through normalized model metadata, streaming, errors, cost, and quota handling.
- Keep context bounded, source-cited, token-estimated, and visible in traces.

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
