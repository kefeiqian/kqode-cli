---
date: 2026-06-25
topic: prompt-lifecycle-fixture
question: "What happens after a user submits a prompt?"
status: complete
---

# Prompt Lifecycle Fixture Report

## Summary

Fixture data shows all selected repos produced enough cited evidence to compare the prompt lifecycle. This file is a contract fixture, not a real research result.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | 1111111 | complete | fixture |
| claude-code | docs/claude-code (local mirror) | n/a | n/a | ac63139 | complete | fixture; local mirror |

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- The fixture prompt enters a command handler before context assembly. [\[1\]][ref-1]
- The fixture tool loop records tool results before continuing. [\[2\]][ref-2]

### Claude Code

**Status:** complete

**Observed behavior**

- The fixture prompt is routed through a query loop that owns the tool cycle. [\[3\]][ref-3]

---

## Cross-Repo Comparison

| Dimension | Codex | Claude Code | Confidence |
|---|---|---|---|
| Prompt ingestion | CLI command handler. [\[1\]][ref-1] | Query loop. [\[3\]][ref-3] | high |

---

## KQode Lessons

### Product behavior

- KQode should make prompt ownership visible in traces because both fixture repos route the prompt through a named runtime owner. Derived from: [\[1\]][ref-1], [\[3\]][ref-3].

### Architecture implications

- KQode should keep tool-loop result recording separate from UI rendering. Derived from: [\[2\]][ref-2].

### Evaluation ideas

- Prompt-lifecycle evals can assert that prompt ingestion and tool result recording are both visible.

### Risks and tradeoffs

- Reports must avoid implying these fixture source paths are real upstream facts.

---

## Evidence Gaps

- None for this fixture.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: prompt ingestion fixture ([code](https://github.com/openai/codex/blob/1111111/crates/cli/src/main.rs#L10-L22)).
- <a id="ref-2"></a>[2] Codex CLI: tool result fixture ([code](https://github.com/openai/codex/blob/1111111/crates/core/src/agent.rs#L50-L74)).
- <a id="ref-3"></a>[3] Claude Code (local mirror): query-loop fixture ([code](../claude-code/query.ts#L30-L55)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
