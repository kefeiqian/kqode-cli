# R54. Session list, resume, continue, delete, rename, and title

**Category:** Sessions and replay
**Source:** [2026-06-25-kqode-requirements.md](../2026-06-25-kqode-requirements.md#sessions-and-replay)
**Build phase:** M4
**Primary owner:** Rust kqode-session

## Intent

This feature ensures KQode can deliver: Session list, resume, continue, delete, rename, and title.
Within the `Sessions and replay` area, its focus is durable event logs, session index, checkpoint, resume, replay, and export.

## What to build

- Implement the smallest user-visible behavior that satisfies R54.
- Connect the behavior to the responsible KQode core surface: Rust kqode-session.
- Record enough trace data for the behavior to be explained after the run.
- Keep first-scope behavior local-first unless the requirement explicitly says deferred.
- First shipped slice: local-only `/resume` backed by append-only JSONL session logs plus a SQLite index, with a single global session table and no remote/local tabs.

## Implementation notes

- Use append-only JSONL for replay truth and SQLite for queryable indexes.
- Persist event data in append-only JSONL and index it for session list, replay, and reports.

## Acceptance evidence

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
