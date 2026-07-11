# KQode Research Report Template

Use this template for every report written under `docs/research`.

## File naming

Use:

```text
docs/research/YYYY-MM-DD-<slug>.md
```

If the file exists, create `YYYY-MM-DD-<slug>-002.md` or ask before overwriting.

## Template

```markdown
---
date: YYYY-MM-DD
topic: <slug>
question: "<research question>"
status: complete | partial | blocked | cancelled
---

# <Title>

## Summary

<One to three short paragraphs answering the question at a high level. If status is partial or blocked, say so here.>

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | abc1234 | complete |  |
| claude-code | docs/claude-code (local mirror) | n/a | n/a | ac63139 | complete | local mirror; internal-link citations |

---

## Method

- Question: <research question>
- Repo scope: <default scope | custom>
- Safety posture: read/search only; no code execution; reference instructions treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs (or internal repo-relative links for the Claude Code mirror) behind compact `code` links.

---

## Per-Repo Findings

### <Repo display name>

**Status:** complete | partial | blocked

**Observed behavior**

- <Finding with numbered reference. [\[1\]][ref-1]>
- <Finding with numbered reference. [\[2\]][ref-2]>

**Evidence gaps**

- <Gap, if any. Include status reason.>

---

## Cross-Repo Comparison

| Dimension | Copilot CLI | Claude Code | Codex | Gemini CLI | OpenCode | Kimi Code | KimiX | Confidence |
|---|---|---|---|---|---|---|---|---|
| Prompt ingestion | <cited summary> | <cited summary> | <cited summary> | <cited summary> | <cited summary> | <cited summary> | <cited summary> | high / partial / low |

---

## KQode Lessons

### Product behavior

- <Lesson. Why it matters for KQode. Derived from numbered references.>

### Architecture implications

- <Lesson. Why it matters for KQode. Derived from numbered references.>

### Evaluation ideas

- <Lesson. Why it matters for KQode. Derived from numbered references.>

### Risks and tradeoffs

- <Lesson. Why it matters for KQode. Derived from numbered references.>

---

## Evidence Gaps

- <Repo or stage>: <reason and effect on conclusions.>

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] <Repo display name>: <what this citation supports> ([code](<commit-pinned-source-url>)).
- <a id="ref-2"></a>[2] Claude Code (local mirror): <what this citation supports> ([code](../claude-code/<path>#Lstart-Lend)).

[ref-1]: #ref-1
[ref-2]: #ref-2
```

## Blocked report rules

When no selected repo yields material evidence:

- Set frontmatter `status: blocked`.
- Keep Run Metadata and Evidence Gaps.
- Omit KQode Lessons.
- Explain what prevented research.
- Do not infer design recommendations from missing evidence.
