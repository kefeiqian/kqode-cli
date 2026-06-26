# R129. Multimodal input for screenshots, UI states, terminal output, design references, images, PDFs, and sketches

**Category:** Multimodal and non-code automation
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#multimodal-and-non-code-automation)
**Build phase:** M10
**Primary owner:** Attachment abstraction and future plugin tools

## Intent

This feature ensures KQode can deliver: Multimodal input for screenshots, UI states, terminal output, design references, images, PDFs, and sketches.
Within the `Multimodal and non-code automation` area, its focus is images, videos, voice, browser automation, computer control, documents, and visualization.

## What to build

- Implement the smallest user-visible behavior that satisfies R129.
- Connect the behavior to the responsible KQode core surface: Attachment abstraction and future plugin tools.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.

## Implementation notes

- Represent inputs as attachments first; defer heavyweight processors to plugins and skills.
- Define the user-visible behavior first, then connect it to the smallest Rust core primitive that supports it.

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
