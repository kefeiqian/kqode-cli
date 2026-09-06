---
date: 2026-06-25
topic: kqode-research-skill
---

# KQode Research Skill Requirements

## Summary

Add a reusable `kqode-research` skill that researches coding-agent reference repositories and writes one cited Markdown report under `docs/research`. The first default research question traces what happens after a user submits a prompt, but the skill must also support other reference-agent research questions.

---

## Problem Frame

KQode uses external coding-agent repositories as product, architecture, and evaluation references, but the current catalog is a high-level index rather than a research workflow. Future KQode planning needs evidence about how those agents work without copying source or turning every investigation into an ad hoc manual repo crawl.

The research skill should turn reference investigation into a repeatable, source-cited workflow. It should preserve the distinction between observed reference behavior and KQode design lessons.

---

## Key Decisions

- **Reusable research skill over prompt-flow-only skill.** The prompt lifecycle investigation is the first use case, not the only supported question.
- **First-scope references by default.** The default repo set is Codex CLI, Aider, OpenCode, Kimi Code, Gemini CLI, and SWE-agent.
- **Fresh upstream source by default.** Reports should use current upstream code and record commit SHAs so the findings remain reproducible.
- **Partial reports are acceptable when evidenced.** A repo fetch or trace failure should produce an explicit incomplete section instead of failing the whole run or silently disappearing.

---

## Actors

- A1. **KQode researcher:** The user or agent invoking the skill with a research question.
- A2. **Research skill:** The workflow that fetches, inspects, synthesizes, and writes the report.
- A3. **Reference repositories:** External coding-agent repositories listed in `docs/kqode_reference_implementations.md`.
- A4. **KQode planner:** The later reader who uses the research report to make KQode product or architecture decisions.

---

## Requirements

**Research scope and inputs**

- R1. The skill must accept a research question instead of hardcoding the prompt lifecycle topic.
- R2. The skill must use the first-scope reference set by default: Codex CLI, Aider, OpenCode, Kimi Code, Gemini CLI, and SWE-agent.
- R3. The skill must allow the user to narrow or expand the repo set for a specific run.
- R4. The skill must use current upstream code by default and record the analyzed commit SHA for each repo.

**Investigation behavior**

- R5. The skill must investigate each selected repo from source evidence, not from uncited summaries.
- R6. For the prompt lifecycle research question, the skill must trace prompt ingestion, context assembly, model call, tool loop, edit/apply path, approvals or safety gates, and session or trace output.
- R7. The skill must capture source citations for every material claim, using repository name plus file path and line reference where possible.
- R8. The skill must mark repo sections incomplete when a repo cannot be fetched, searched, or confidently traced, and include the reason.

**Report output**

- R9. The skill must write one combined Markdown report under `docs/research`.
- R10. The report must include the research question, selected repos, analyzed commit SHAs, per-repo findings, cross-repo comparison, and KQode design lessons.
- R11. The report must separate observed reference behavior from KQode recommendations.
- R12. The report must call out confidence levels or evidence gaps when findings rely on partial traces.

**KQode alignment**

- R13. The skill must frame findings as product behavior, architecture ideas, evaluation design, or risks that matter to KQode.
- R14. The skill must avoid source-copying guidance and should not recommend vendoring or reproducing reference implementation code.
- R15. The skill must preserve KQode's local-first direction unless the research evidence directly supports a later-scope surface.

---

## Key Flows

- F1. Researching the default prompt lifecycle question
  - **Trigger:** A researcher asks the skill to investigate what happens after a user submits a prompt to the selected reference agents.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The skill selects the first-scope repos, fetches current upstream source, records SHAs, traces each repo's prompt lifecycle from source evidence, compares the flows, and writes one report under `docs/research`.
  - **Outcome:** The planner receives a cited comparison plus KQode design lessons.
  - **Covered by:** R1, R2, R4, R5, R6, R7, R9, R10, R11, R13

- F2. Researching another reference question
  - **Trigger:** A researcher asks a different question about the reference implementations.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The skill uses the provided question to select relevant source paths, gathers cited evidence, compares the selected repos, and writes one report with recommendations scoped to KQode.
  - **Outcome:** The skill remains reusable beyond the initial prompt-flow investigation.
  - **Covered by:** R1, R3, R5, R7, R9, R10, R11, R13

- F3. Producing a partial but useful report
  - **Trigger:** One selected repo cannot be fetched or traced with enough confidence.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The skill continues with the remaining repos, records the failure in the affected repo section, labels any dependent comparison as partial, and preserves the evidence collected so far.
  - **Outcome:** The report is useful without hiding gaps.
  - **Covered by:** R8, R12

---

## Acceptance Examples

- AE1. **Covers R6, R10, R11.** Given the default prompt lifecycle question, when the skill completes, then the report includes per-repo prompt lifecycle traces and a separate KQode lessons section.
- AE2. **Covers R1, R3.** Given a researcher asks about provider abstraction patterns in only Aider and Codex CLI, when the skill runs, then the report focuses on that question and those repos rather than the default prompt lifecycle set.
- AE3. **Covers R4, R7.** Given the skill analyzes current upstream source, when it writes the report, then each repo section names the analyzed commit SHA and cites source locations for material claims.
- AE4. **Covers R8, R12.** Given one repo cannot be fetched, when the report is written, then that repo appears as incomplete with the failure reason and the comparison labels affected conclusions as partial.
- AE5. **Covers R14.** Given a reference repo has an attractive implementation detail, when the skill writes KQode lessons, then it describes the transferable behavior or design lesson without instructing KQode to copy code.

---

## Success Criteria

- The first run can answer the prompt lifecycle question for the first-scope references with cited source evidence.
- A later run can answer a different research question without changing the skill itself.
- A KQode planner can use the report without needing to re-open every reference repository for basic traceability.
- The report makes incomplete research and confidence gaps visible.

---

## Scope Boundaries

- Secondary references in `docs/kqode_reference_implementations.md` are not part of the v1 default set.
- Public but non-open-source products are not source-repo research targets.
- The skill does not replace KQode's later evaluation runner or benchmark harness.
- The skill does not authorize copying, vendoring, or porting source from reference projects.

---

## Dependencies / Assumptions

- The skill can access public upstream repositories for the selected reference implementations.
- `docs/kqode_reference_implementations.md` remains the source of truth for the default and optional reference repo list.
- Reports under `docs/research` are intended as durable project artifacts, not transient scratch notes.

---

## Sources / Research

- `docs/kqode_reference_implementations.md:3` defines reference repos as sources for product behavior, architecture ideas, and evaluation design while keeping KQode original.
- `docs/kqode_reference_implementations.md:70-79` defines the first-scope reference set used by this skill's v1 default.
- `docs/kqode_reference_implementations.md:53-68` says KQode should borrow behaviors and patterns while avoiding source copying and overbuilding.
- `docs/kqode_build_path.md:135-149` places skills, MCP, plugins, trust prompts, and conversational MCP config in M7.
- `docs/kqode_build_path.md:151-164` places subagents, child sessions, trace linkage, budgets, permissions, and result consolidation in M8.
- `docs/features/r089_skills_style_reusable_workflows.md:20-24` requires local-first skills and explicit, inspectable, permission-controlled extension loading.
- `docs/features/r098_multi_agent_agent_swarm_workflows_with_specialist_sub_agents.md:20-24` frames subagents as child sessions with trace, policy, budget, and parent linkage.
- `docs/features/r137_traces_for_prompts_model_outputs_tool_calls_approvals_context_costs_late.md:20-25` requires machine-readable metrics, human-readable evidence, append-only event persistence, and source-cited bounded context.
