# R157. KQode keeps advanced RAG, model fine-tuning, model serving, cloud-native deployment, enterprise policy, GitHub automation, and cross-device ecosystem features as later proof-of-depth areas

**Category:** Portfolio and scope boundaries
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#portfolio-and-scope-boundaries)
**Build phase:** M9
**Primary owner:** Docs, README, eval reports, and demo artifacts

## Intent

This feature ensures KQode can deliver: KQode keeps advanced RAG, model fine-tuning, model serving, cloud-native deployment, enterprise policy, GitHub automation, and cross-device ecosystem features as later proof-of-depth areas.
Within the `Portfolio and scope boundaries` area, its focus is interview proof, JD mapping, scope control, and artifact quality.

## What to build

- Implement the smallest user-visible behavior that satisfies R157.
- Connect the behavior to the responsible KQode core surface: Docs, README, eval reports, and demo artifacts.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Turn implemented features into evidence: trace, diff, checks, report, and demo walkthrough.
- Mark this as an explicit deferred capability in roadmap and avoid coupling first-scope code to it.
- Add only the interface seam or data model needed to avoid future rewrites.
- Expose provider behavior through normalized model metadata, streaming, errors, cost, and quota handling.

## Acceptance evidence

- The roadmap names the capability, its trigger, and the prerequisite milestone.
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
