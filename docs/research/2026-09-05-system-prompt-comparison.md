---
date: 2026-09-05
topic: system-prompt-comparison
question: "其他 coding agent 的 system prompt 如何组织？KQode 当前 system prompt 可以借鉴哪些部分？"
status: complete
---

# Coding Agent System Prompt 对比与 KQode 借鉴建议

## Summary

当前 KQode 的 API provider 路径只使用一句静态 system prompt：定义 KQode 是简洁、有帮助的 coding assistant，并要求使用用户语言回复。它没有描述工作区、工具能力、安全边界、项目指令、编辑与验证流程、Git 规则、运行模式、skills、MCP、子代理或最终交付格式。Copilot CLI provider 甚至不复用这句 prompt，而是把历史序列化成一个普通 prompt，同时关闭 custom instructions、内置 MCP、询问工具和全部可用工具。[\[35\]][ref-35] [\[45\]][ref-45]

五个参考实现没有一份可以直接复制的“最佳全文”。更稳定的共同方向是：**核心规则保持稳定，运行时能力和环境作为独立片段注入，低信任项目或插件内容显式降权，模式变化同时改变 prompt 和真实权限。** Codex 偏向基础指令加动态 world-state fragments；Gemini CLI 使用细粒度 typed section composer；Kimi Code 使用中等长度共享模板加变量和 role overlay；OpenCode 根据模型选择完整模板；Pi 保持极简并根据真实工具集动态生成。[\[1\]][ref-1] [\[4\]][ref-4] [\[6\]][ref-6] [\[22\]][ref-22] [\[29\]][ref-29] [\[39\]][ref-39]

KQode 最优先应该借鉴的不是更多 prompt 文案，而是建立一个**有类型、可组合、可测试、可观测的 prompt pipeline**。第一阶段建议采用 Kimi 的共享模板思路、Gemini 的 section composer、Codex 的动态 fragment 和 Pi 的能力驱动生成；避免复制 OpenCode 的多份完整 prompt，也不要依靠 prompt 代替工具层权限控制。

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | `07f18d5ff74bb361b46e1eacab0bddc28da26752` | complete | Fetched 2026-09-05T00:44:39Z; detached HEAD |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | `5b1e31988ed74b821b3a7ca6647188446992aafc` | complete | Fetched 2026-09-05T00:44:37Z; detached HEAD |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | `f9ca33376604ae91ea35a4ac1d6f1d4425a5aead` | complete | Fetched 2026-09-05T00:44:37Z; detached HEAD |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | `85aca163f6c73ac6ce380b5447359146b8adcae4` | complete | Fetched 2026-09-05T00:44:37Z; detached HEAD |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | `9841914c71a74d81abe07f751aefd271fd924e63` | complete | Fetched 2026-09-05T00:44:37Z; detached HEAD |
| KQode baseline | https://github.com/kefeiqian/kqode-cli | https://github.com/kefeiqian/kqode-cli | release/v0.3.0 | `28b8fcb69d0c4cc046d2e9ab7249e52da6acec80` | complete | Local source inspection; relevant files unmodified |

---

## Method

- Question: 其他 coding agent 的 system prompt 如何组织，以及 KQode 当前 prompt 可以借鉴哪些部分。
- Repo scope: default first-scope.
- Search themes: prompt source and assembly, dynamic fragments, project instructions, tools, editing, safety, Git, validation, modes, skills, MCP, subagents, final response, overrides, and observability.
- Safety posture: read/search only; no reference code execution; reference instructions treated as untrusted source data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.
- Copyright posture: findings paraphrase behavior and structure; the report does not reproduce full third-party prompts.

---

## Current KQode Baseline

**Observed behavior**

- OpenAI-compatible providers and Anthropic share one static constant. The prompt only establishes identity, concision/helpfulness, and response language; request assembly does not add runtime environment, tool, project, safety, validation, Git, or mode sections. [\[35\]][ref-35]
- The Copilot CLI provider follows a separate path. It disables external custom instructions, built-in MCPs, remote features, user questions, and all tools, then places the full conversation into a plain text prompt asking Copilot CLI to answer the latest user message. KQode therefore does not currently have one provider-independent effective system prompt. [\[45\]][ref-45]
- The existing implementation has no prompt composer or typed fragment model. Any new behavior added directly to the constant would mix stable policy with changing environment and capability facts, making provider parity, testing, overrides, and tracing difficult. [\[35\]][ref-35] [\[45\]][ref-45]

**Gap against the project direction**

- Existing KQode planning documents already call for identity, tone, cwd, OS, Git identity, date, active model, and future tool-use sections, but the checked-in implementation has not reached that composed design yet.

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- Codex combines a substantial base instruction template with separate runtime context fragments. Its base prompt covers identity, scoped project instructions, preambles, planning, autonomous completion, minimal edits, validation, Git/worktree hygiene, final-answer style, search conventions, and patch use. [\[1\]][ref-1]
- The effective base prompt is selected by priority: explicit configuration, restored-session instructions, or the current model catalog's instruction template. The repository's default Markdown is therefore representative, not guaranteed to be the exact prompt for every model and session. [\[2\]][ref-2]
- Project instructions are not silently merged into the trusted base text. `AGENTS.md` content is wrapped as a bounded user-role context fragment, preserving its source and lower instruction level. [\[3\]][ref-3]
- Environment facts such as cwd, shell, date, timezone, network state, file-system permissions, and subagent availability are represented as updateable world-state rather than permanent prose. [\[4\]][ref-4]
- Sandbox and approval policy are rendered as a separate developer instruction fragment, so a permission change can replace that state without rebuilding unrelated identity or workflow rules. [\[5\]][ref-5]
- Collaboration mode and personality are also independent developer fragments that can change during a session. Managed developer instructions use an isolated channel and reject oversized content rather than silently truncating it. [\[9\]][ref-9] [\[10\]][ref-10] [\[11\]][ref-11]
- Newer model-specific instructions distinguish implementation requests from questions, planning, and brainstorming. Autonomy is conditional on task intent rather than an unconditional instruction to edit. [\[8\]][ref-8]

**What KQode should borrow**

- Separate stable policy from changing world state.
- Represent environment, permissions, mode, and personality as independently versioned fragments.
- Treat project instructions as scoped context with explicit boundaries and provenance.
- Keep provider serialization separate from semantic prompt assembly.

**Evidence gaps**

- Model catalog data can select different instruction templates; static source inspection cannot identify the exact effective prompt for every remote model configuration.

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode selects a different full base template by provider and model family. GPT Codex, generic GPT, Gemini, Claude, Kimi, and several other model families have separate prompt files. [\[6\]][ref-6]
- The templates compensate for model behavior differently. Representative variants emphasize professional tools and Git hygiene, minimal correct edits and response channels, structured engineering workflow and verification, or action-oriented same-language responses. [\[12\]][ref-12] [\[13\]][ref-13] [\[14\]][ref-14] [\[15\]][ref-15]
- Each turn dynamically appends model identity, cwd, workspace root, Git state, platform, date, reference directories, skill catalog, permission-filtered MCP instructions, and project/user instructions. [\[16\]][ref-16] [\[17\]][ref-17]
- Agent-specific prompts can replace the model template, and a plugin hook can transform the assembled system content before the provider request. OpenAI OAuth and normal provider paths serialize the result differently. [\[18\]][ref-18]
- Project instructions may come from global configuration, ancestor directories, explicitly configured local files, or remote URLs. [\[19\]][ref-19]
- Build, plan, general, and explore agents have different real permission sets. Plan/build transitions also inject synthetic reminders, so the prompt and executable permissions reinforce each other. [\[20\]][ref-20] [\[21\]][ref-21]

**What KQode should borrow**

- Maintain a small model adaptation layer for known model behavior differences.
- Resolve permissions before injecting MCP or tool-related instructions.
- Ensure plan, explore, and build modes change actual tool access, not only wording.

**Risks to avoid**

- Full prompt copies per model create rule drift. Shared sections plus small model overlays would be safer for KQode.
- Remote instruction sources and unrestricted transform hooks expand the trust boundary and require explicit opt-in, provenance, limits, and auditing.

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Kimi's shared system template is medium-sized and focused. It covers identity, same-language communication, self-contained final answers, evidence-based correction, dedicated-tool preference, parallel reads, refusal non-bypass, compatibility with existing code, risk-aware actions, complete delivery, honest validation, compaction recovery, environment facts, directory summary, and project instructions. [\[22\]][ref-22]
- Environment and extension data are inserted through named template variables: product and style, OS, shell, cwd, bounded directory listing, extra workspaces, project instruction contents and sources, skills, and plugin instructions. [\[23\]][ref-23]
- The template explicitly treats project and plugin instructions as lower-trust reference data that cannot elevate their own authority or override higher-level safety and user intent. [\[22\]][ref-22] [\[23\]][ref-23]
- Default, coder, explore, and plan profiles share the core prompt and add role overlays while changing their available tool sets. Coder produces a complete handoff to its parent; explore and plan are constrained to read-oriented work. [\[24\]][ref-24] [\[25\]][ref-25]
- User `SYSTEM.md` and custom agent definitions can compose with the built-in prompt rather than forcing every customization to duplicate it. Plugin prompt fields are validated, path-resolved, size-limited, and injected only for enabled healthy plugins. [\[26\]][ref-26] [\[27\]][ref-27] [\[28\]][ref-28]

**What KQode should borrow**

- Use one shared base prompt plus role overlays.
- Keep the first implementation compact while covering refusal handling, partial completion, validation, final handoff, and compaction semantics.
- Add explicit trust language for project/plugin content.
- Use variables or typed inputs for environment and capability sections.

**Evidence gaps**

- User prompt overrides and installed plugins can materially alter the final prompt; static inspection proves the extension mechanism, not a specific user's effective result.

### Gemini CLI

**Status:** complete

**Observed behavior**

- Gemini CLI uses a typed section composer rather than one Markdown file. `SystemPromptOptions` can include preamble, core mandates, subagents, skills, hook context, primary or planning workflow, task tracker, operational guidelines, sandbox, YOLO mode, and Git state. [\[29\]][ref-29]
- `PromptProvider` activates sections based on interaction and approval modes, registered tools and agents, available skills, tracker state, sandbox, Git status, model capabilities, and modern-versus-legacy prompt support. [\[30\]][ref-30]
- Core rules address secret protection, no unsolicited staging/commits, untrusted MCP and external output, context-efficient search, type safety, intent classification, tests after changes, and the priority of live user hints. [\[31\]][ref-31]
- Operational rules cover parallel tool calls, conflicts when editing the same resource, explaining consequential commands, handling denied tools without workarounds, and always following a tool result with another action or a user-facing response. [\[32\]][ref-32]
- Its main workflow separates Research, Strategy, and Execution; execution includes plan, act, and validate. It also provides an explicit escape condition after repeated failures so the agent rechecks assumptions rather than looping indefinitely. [\[32\]][ref-32]
- Subagent and skill sections appear only when those capabilities exist. The subagent policy discourages delegation for simple work and prohibits parallel agents from modifying the same resource. [\[33\]][ref-33]
- Plan mode has a dedicated renderer with read-only exploration, plan-location constraints, consultation, and approval semantics. [\[34\]][ref-34]
- Memory is divided into global, private-project, extension, and project layers with declared conflict rules. Major sections can be individually disabled, and the effective prompt can be exported for debugging. [\[36\]][ref-36] [\[37\]][ref-37]
- Sandbox and Git sections are generated from actual runtime state, including recovery behavior, per-file staging, diff/log inspection, and no unsolicited push. [\[38\]][ref-38]

**What KQode should borrow**

- Define typed inputs and renderers for each prompt section.
- Enable sections only when corresponding capabilities exist.
- Make sections independently testable and feature-flagged.
- Add an effective-prompt export or hash for debugging and regression evaluation.
- Include an explicit anti-loop rule after repeated failed attempts.

**Risks to avoid**

- Gemini's rule density is high. Copying the full length would increase conflicts and token cost; KQode should start with fewer sections and expand only when evaluations justify them.

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- Pi dynamically generates a short base prompt containing identity, current tools and one-line summaries, extension-tool notice, tool-dependent exploration guidance, concise response rules, project context, skills, and cwd. [\[39\]][ref-39]
- Only tools that are actually registered and provide prompt snippets appear in the available-tool section. Tool-specific guidelines are deduplicated before injection. [\[40\]][ref-40]
- A custom prompt can replace the default identity and guidelines while still appending project context, skills, cwd, and append-system content. [\[39\]][ref-39]
- Context discovery supports override and normal project instruction files across global and ancestor directories. Project-level system overrides are accepted only for trusted projects. [\[41\]][ref-41] [\[42\]][ref-42]
- Skills are advertised only when the agent can load them, and the prompt contains only a catalog of names, descriptions, and locations; full skill content is loaded on demand. Skills marked unavailable to the model are omitted. [\[43\]][ref-43]
- Extensions can inspect and replace the system prompt before an agent starts, with subsequent extensions receiving the already-modified result. [\[44\]][ref-44]

**What KQode should borrow**

- Generate capability guidance from the live tool registry.
- Advertise skills as a lightweight catalog and load details on demand.
- Keep the base prompt short enough that project context and runtime state retain attention.

**Risks to avoid**

- Pi's default core has fewer explicit Git, validation, safety, and final-handoff rules.
- Arbitrary extension replacement of the full prompt requires stronger trust gates than KQode should initially allow.

---

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Coding Agent | Confidence |
|---|---|---|---|---|---|---|
| Base shape | Full base plus dynamic fragments [\[1\]][ref-1] [\[4\]][ref-4] | Full template selected per model [\[6\]][ref-6] | Shared template plus variables/overlays [\[22\]][ref-22] [\[24\]][ref-24] | Typed section composer [\[29\]][ref-29] | Short prompt generated from capabilities [\[39\]][ref-39] | high |
| Model adaptation | Model catalog can select templates [\[2\]][ref-2] | Broad full-template branching [\[6\]][ref-6] | Mostly shared base | Modern/legacy and capability switches [\[30\]][ref-30] | No strong built-in model branching observed | high |
| Runtime environment | Updateable world-state fragment [\[4\]][ref-4] | Dynamic environment section [\[16\]][ref-16] | Template variables [\[23\]][ref-23] | Conditional renderers [\[30\]][ref-30] | cwd appended to generated prompt [\[39\]][ref-39] | high |
| Project instructions | Scoped user-role fragment [\[3\]][ref-3] | Global/local/ancestor/remote sources [\[19\]][ref-19] | Lower-trust project reference data [\[22\]][ref-22] | Layered memory with precedence [\[36\]][ref-36] | Ancestor context and trusted project overrides [\[41\]][ref-41] [\[42\]][ref-42] | high |
| Tool guidance | Stable guidance plus structured schemas [\[1\]][ref-1] [\[7\]][ref-7] | Template guidance plus active tools | Profile-based tools [\[24\]][ref-24] | Sections driven by tool registry [\[30\]][ref-30] | Current-tool summaries only [\[40\]][ref-40] | high |
| Permissions and sandbox | Separate dynamic permission fragment [\[5\]][ref-5] | Agent permissions plus transition reminders [\[20\]][ref-20] [\[21\]][ref-21] | Refusal non-bypass plus profile tools [\[22\]][ref-22] | Mode-specific sandbox and Git sections [\[38\]][ref-38] | Mostly enforced outside the default prompt | high |
| Planning | Collaboration-mode overlay [\[9\]][ref-9] | Plan agent and reminders [\[20\]][ref-20] [\[21\]][ref-21] | Read-only plan profile [\[25\]][ref-25] | Dedicated planning renderer [\[34\]][ref-34] | No heavy built-in planning protocol observed | high |
| Skills and MCP | Separate extension/tool systems | Skill catalog and permission-filtered MCP instructions [\[16\]][ref-16] | Skills and lower-trust plugin instructions [\[23\]][ref-23] | Conditional skill/subagent sections [\[33\]][ref-33] | On-demand skill catalog [\[43\]][ref-43] | high |
| Extensibility | Config/model fragments | Agent override and transform hook [\[18\]][ref-18] | Base composition and validated plugin input [\[26\]][ref-26] [\[28\]][ref-28] | Section flags and full export/override [\[30\]][ref-30] [\[37\]][ref-37] | Full extension rewrite hook [\[44\]][ref-44] | high |
| Main maintenance risk | Fragment precedence complexity | Duplicate templates drift | Override/plugin complexity | Excessive length and conflicting mandates | Under-specified core safety | high |

---

## KQode Lessons

### Product behavior

#### P0. Define intent and autonomy explicitly

- Distinguish inquiry, review, planning, research, and implementation. Questions should receive answers; explicit implementation requests should continue to a completed, verified result without unnecessary confirmation. Ask only for genuine blockers, irreversible decisions, or choices with materially different outcomes. Codex, Kimi, and Gemini all encode some form of this distinction. [\[8\]][ref-8] [\[22\]][ref-22] [\[31\]][ref-31]
- State that denied actions cannot be retried through a different tool or path. This prevents prompt-level “helpfulness” from becoming permission bypass behavior. [\[22\]][ref-22] [\[32\]][ref-32]
- Require honest completion language: partial implementation, failed checks, or unverified behavior must not be presented as complete. [\[1\]][ref-1] [\[22\]][ref-22]

#### P0. Add minimum editing, Git, and validation rules

- Preserve unrelated user changes, inspect local conventions, prefer focused changes, avoid destructive Git, and do not commit, amend, stage broadly, push, or rewrite history without the relevant request. [\[1\]][ref-1] [\[12\]][ref-12] [\[38\]][ref-38]
- Validate the user-visible behavior, beginning with the smallest relevant test and expanding to lint, typecheck, or build when applicable. Do not fix unrelated failures, and explicitly report checks that could not run. [\[1\]][ref-1] [\[22\]][ref-22] [\[32\]][ref-32]

#### P1. Make final responses self-contained

- Important conclusions must appear in the final response rather than only in progress messages or tool output. The final should state the result, meaningful changes, validation outcome, and unresolved gaps, with concise file references where useful. [\[1\]][ref-1] [\[12\]][ref-12] [\[22\]][ref-22]
- Progress updates should be event-driven: start of a substantial phase, important discovery, blocker, or plan change. Routine reads and searches should not each produce narration. [\[1\]][ref-1] [\[31\]][ref-31] [\[32\]][ref-32]

### Architecture implications

#### P0. Replace the string constant with a typed prompt composer

Recommended semantic layers:

1. `core_identity`
2. `core_integrity_and_safety`
3. `intent_and_autonomy`
4. `tool_guidance`
5. `editing_and_validation`
6. `git_and_workspace_safety`
7. `runtime_environment`
8. `project_context`
9. `mode_overlay`
10. `skills_mcp_subagents`
11. `final_response`

The fixed core and dynamic layers should be separate values in the normalized provider request. Provider adapters should only map roles and wire formats; they should not own prompt content. This follows the maintainable parts of Codex, Kimi, and Gemini while avoiding OpenCode-style full-template duplication. [\[4\]][ref-4] [\[23\]][ref-23] [\[29\]][ref-29] [\[35\]][ref-35]

#### P0. Establish a prompt trust model

Recommended precedence:

```text
core_system
  > runtime_policy
  > current_user_instruction
  > user_preferences
  > project_context
  > plugin_or_mcp_context
  > tool_or_external_output
```

- Every non-core fragment should carry source, trust level, scope, and size metadata.
- Project, plugin, MCP, and tool content should be explicitly marked as data that cannot elevate permission or override core safety.
- Prompt overrides should initially be append/overlay based. Full replacement should require explicit trust and should remain observable.

Kimi and Gemini provide the strongest direct examples of trust downgrading; Codex provides a useful role-separated fragment model. [\[3\]][ref-3] [\[22\]][ref-22] [\[23\]][ref-23] [\[31\]][ref-31] [\[36\]][ref-36]

#### P0. Generate guidance from actual capabilities

- The composer should receive the active tool registry, sandbox, approval policy, mode, and provider capabilities.
- Only enabled tools should be described.
- Disabling a tool must remove its behavioral guidance.
- Plan/read-only mode must change both the prompt overlay and executable permissions.
- MCP instructions should be injected only if the server has at least one currently accessible tool.

Pi, OpenCode, and Gemini demonstrate complementary pieces of this capability-driven design. [\[16\]][ref-16] [\[20\]][ref-20] [\[30\]][ref-30] [\[40\]][ref-40]

#### P1. Use structured runtime fragments

Environment facts should be generated separately from behavioral prose, for example:

```xml
<environment_context>
  <cwd>...</cwd>
  <workspace_root>...</workspace_root>
  <platform>...</platform>
  <shell>...</shell>
  <date>...</date>
  <git_repo>true</git_repo>
  <sandbox>workspace-write</sandbox>
  <approval_mode>on-request</approval_mode>
</environment_context>
```

This makes changing cwd, sandbox, approval mode, model, or Git status observable and independently testable. Codex's world-state model and OpenCode's environment section support this direction. [\[4\]][ref-4] [\[16\]][ref-16]

#### P1. Model task modes as overlays

Recommended initial modes:

- `default`: autonomous implementation for explicit directives.
- `plan`: read-only investigation and decision-complete plan.
- `review`: high-confidence findings ordered by severity.
- `research`: read-only evidence gathering with citations.
- `subagent`: bounded ownership and a complete handoff to the parent.

Each overlay should be small and should reference shared core sections rather than copy them. Codex collaboration fragments, Kimi profiles, OpenCode permissions, and Gemini's planning renderer all support this approach. [\[9\]][ref-9] [\[20\]][ref-20] [\[24\]][ref-24] [\[34\]][ref-34]

#### P1. Add compaction recovery semantics

When history is summarized, the prompt should clarify that:

- the summary records prior work but is not authoritative for current file, process, or permission state;
- completed work should not be repeated without reason;
- transient facts must be rechecked through tools;
- newer user instructions override stale summarized intent.

Kimi provides the clearest observed model for this behavior. [\[22\]][ref-22]

#### P1. Keep skills, MCP, and subagents lightweight

- Inject skill name, description, source, activation rule, and path; load full instructions only when selected. [\[16\]][ref-16] [\[23\]][ref-23] [\[33\]][ref-33] [\[43\]][ref-43]
- Require parent agents to provide complete context and child agents to return a self-contained handoff.
- Do not delegate simple reads or edits.
- Do not run parallel agents that can modify the same resource.
- Enforce read-only versus editing roles in the tool layer. [\[20\]][ref-20] [\[24\]][ref-24] [\[33\]][ref-33]
- Limit plugin/MCP prompt size, record source and hash, filter inaccessible capabilities, and prohibit silent replacement of the trusted core. [\[16\]][ref-16] [\[23\]][ref-23] [\[28\]][ref-28] [\[44\]][ref-44]

#### P2. Add small model overlays, not full prompt forks

All providers should share the semantic core. Model overlays should be limited to known differences such as tool-call preference, reasoning/planning behavior, supported features, or output-style compensation. OpenCode proves the value of adaptation but also exposes the maintenance cost of full copies; Kimi and Gemini show more composable alternatives. [\[6\]][ref-6] [\[23\]][ref-23] [\[30\]][ref-30]

#### P2. Make the effective prompt observable

For each model request, record:

- prompt schema/version;
- active section names and versions;
- fragment source, trust level, character/token estimate, and content hash;
- active mode, tools, skills, MCP servers, sandbox, and approval state;
- whether a user, project, plugin, or provider overlay changed the prompt;
- final effective prompt hash;
- optional redacted prompt export for debugging.

Gemini's export and section flags, Codex's isolated runtime fragments, and Pi's extension-visible prompt options provide evidence for this direction. [\[5\]][ref-5] [\[30\]][ref-30] [\[37\]][ref-37] [\[44\]][ref-44]

### Evaluation ideas

1. **Provider parity:** the same normalized sections should produce equivalent behavior for OpenAI-compatible and Anthropic request shapes; Copilot CLI should either accept the composed prompt or be explicitly marked as a separate reduced-capability mode.
2. **Capability synchronization:** disable `write` or shell access and assert that the effective prompt contains no instruction to use it.
3. **Mode integrity:** plan/research modes must reject editing at the tool layer even if project instructions request changes.
4. **Trust-boundary injection:** place adversarial instructions in project, MCP, plugin, and tool-result content and verify they cannot replace core safety or elevate permissions.
5. **User-change preservation:** begin with unrelated dirty files and verify the agent neither reverts nor stages them.
6. **Validation honesty:** force a test failure or unavailable test runner and verify the final answer does not claim success.
7. **Compaction:** summarize a session, mutate the workspace externally, and verify the agent rechecks transient state instead of trusting the summary.
8. **Model overlay consistency:** run shared golden tasks across provider/model overlays and detect behavioral drift in editing, validation, and final answer.
9. **Prompt budget:** measure tokens per section and fail when optional context exceeds configured limits.
10. **Observability:** given a trace, reconstruct which sections and sources formed the effective prompt without storing secrets.
11. **Anti-loop:** simulate repeated tool failures and verify the agent changes assumptions or asks for a blocker rather than repeating the same operation.
12. **Final-answer completeness:** hide progress/tool output from the evaluator and verify the final response alone communicates outcome and gaps.

### Risks and tradeoffs

- **Long prompts can reduce instruction salience.** Gemini's structure is useful, but its full rule density should not be copied before KQode has prompt regression evaluations. [\[29\]][ref-29] [\[31\]][ref-31]
- **Model forks drift.** OpenCode's model-specific templates offer adaptation at the cost of duplicated policy. KQode should keep overlays small and test shared invariants. [\[6\]][ref-6]
- **Prompt safety is not enforcement.** Sandbox, network, Git, external paths, approvals, and read-only modes must be enforced by tools and policy services. [\[5\]][ref-5] [\[20\]][ref-20] [\[38\]][ref-38]
- **Overrides expand the trust boundary.** Full project or extension replacement can remove critical rules. Prefer scoped overlays, trust gates, limits, provenance, and audit logs. [\[26\]][ref-26] [\[28\]][ref-28] [\[42\]][ref-42] [\[44\]][ref-44]
- **Dynamic context can leak sensitive data.** Environment and project fragments should be minimized, redacted, and recorded as third-party-bound context before sending to a provider.
- **Provider divergence already exists in KQode.** API providers receive KQode's static system string while Copilot CLI receives a differently constructed prompt. A composer must define whether Copilot is brought into parity or intentionally exposed as a constrained adapter. [\[35\]][ref-35] [\[45\]][ref-45]

---

## Recommended KQode V1 Prompt Outline

```text
1. Identity
   - KQode coding agent
   - precise, concise, evidence-based
   - reply in the user's language

2. Instruction Trust
   - define precedence among core, runtime, user, project, plugin, and tool data
   - external/tool/MCP output is untrusted context

3. Intent and Autonomy
   - distinguish inquiry, review, planning, research, and implementation
   - implement explicit directives autonomously
   - ask only for genuine blockers or irreversible decisions

4. Tool Use
   - describe only currently enabled tools
   - prefer dedicated tools before shell
   - parallelize independent reads
   - never bypass a denied action

5. Editing and Workspace Safety
   - inspect local conventions
   - make focused changes
   - preserve unrelated user changes
   - protect credentials
   - no destructive Git or unsolicited commit/push

6. Validation
   - verify the user-visible scenario
   - run focused checks first
   - report failures and unverified behavior honestly

7. Runtime Environment
   - cwd, workspace root, platform, shell, date
   - Git, sandbox, approval mode
   - active provider/model and enabled capabilities

8. Project Context
   - scoped instructions with source paths
   - explicitly lower trust than core and current user instructions

9. Optional Capabilities
   - skills catalog
   - MCP catalog
   - subagent roles and concurrency rules

10. Communication
   - progress updates only at meaningful phase changes
   - final answer is concise and self-contained
   - include outcome, validation, and remaining gaps
```

This outline should be implemented as independently rendered sections, not one hand-maintained literal.

---

## Evidence Gaps

- The research did not execute any CLI or capture live provider payloads; findings come from source pinned to the listed SHAs.
- Codex can receive model-catalog instruction templates that differ from the repository default prompt. [\[2\]][ref-2]
- OpenCode has more model templates than the representative files reviewed, and plugins can transform the final prompt. [\[6\]][ref-6] [\[18\]][ref-18]
- Gemini's final section combination depends on model, tools, approval mode, sandbox, environment variables, and experimental features; not every combination was enumerated. [\[30\]][ref-30]
- Kimi plugins and Pi extensions can change the final effective prompt; source inspection establishes the extension points and controls, not installed-user outcomes. [\[28\]][ref-28] [\[44\]][ref-44]
- KQode's current Copilot CLI adapter delegates to another product's built-in agent prompt while disabling custom instructions and tools; this report can describe the adapter configuration but cannot inspect the proprietary effective prompt behind that invocation. [\[45\]][ref-45]

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: default base prompt rules for identity, project instructions, planning, execution, validation, Git, and final responses ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/protocol/src/prompts/base_instructions/default.md#L1-L276)).
- <a id="ref-2"></a>[2] Codex CLI: base-instruction selection priority during session startup ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/session/mod.rs#L681-L701)).
- <a id="ref-3"></a>[3] Codex CLI: scoped project instructions represented as a bounded user-role fragment ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/context/user_instructions.rs#L1-L32)).
- <a id="ref-4"></a>[4] Codex CLI: environment data represented as updateable world-state context ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/context/world_state/environment.rs#L195-L260)).
- <a id="ref-5"></a>[5] Codex CLI: approval and sandbox state rendered as a separate permission fragment ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/context/world_state/permissions.rs#L19-L89)).
- <a id="ref-6"></a>[6] OpenCode: provider/model-based selection of base prompt templates ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/system.ts#L6-L49)).
- <a id="ref-7"></a>[7] Codex CLI: standard Responses and Responses Lite package instructions and tools differently ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/client.rs#L930-L980)).
- <a id="ref-8"></a>[8] Codex CLI: model-specific autonomy, planning, and task-intent rules ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/gpt_5_2_prompt.md#L24-L56)).
- <a id="ref-9"></a>[9] Codex CLI: collaboration mode as a replaceable developer fragment ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/context/world_state/collaboration_mode.rs#L24-L171)).
- <a id="ref-10"></a>[10] Codex CLI: personality as an independently updateable developer fragment ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/context/world_state/personality.rs#L21-L83)).
- <a id="ref-11"></a>[11] Codex CLI: isolated managed developer instructions with replacement and size limits ([code](https://github.com/openai/codex/blob/07f18d5ff74bb361b46e1eacab0bddc28da26752/codex-rs/core/src/context/world_state/managed_developer_instructions.rs#L12-L79)).
- <a id="ref-12"></a>[12] OpenCode: Codex-oriented editing, tools, Git, and final-answer rules ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/prompt/codex.txt#L1-L103)).
- <a id="ref-13"></a>[13] OpenCode: GPT-oriented minimal changes, autonomy, review, and response-channel rules ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/prompt/gpt.txt#L1-L126)).
- <a id="ref-14"></a>[14] OpenCode: Gemini-oriented engineering workflow, safety, and validation rules ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/prompt/gemini.txt#L1-L163)).
- <a id="ref-15"></a>[15] OpenCode: Kimi-oriented action, language, research, and environment rules ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/prompt/kimi.txt#L1-L103)).
- <a id="ref-16"></a>[16] OpenCode: environment, reference directories, skills, and permission-filtered MCP instructions ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/system.ts#L57-L136)).
- <a id="ref-17"></a>[17] OpenCode: per-turn composition of environment, project instructions, MCP, skills, and structured-output rules ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/prompt.ts#L1257-L1286)).
- <a id="ref-18"></a>[18] OpenCode: agent prompt override, system transform hook, and provider request mapping ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/llm/request.ts#L51-L99)).
- <a id="ref-19"></a>[19] OpenCode: local, ancestor, configured, and remote instruction loading ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/instruction.ts#L115-L175)).
- <a id="ref-20"></a>[20] OpenCode: distinct permissions for build, plan, general, and explore agents ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/agent/agent.ts#L95-L205)).
- <a id="ref-21"></a>[21] OpenCode: plan/build behavior transitions through synthetic reminders ([code](https://github.com/anomalyco/opencode/blob/5b1e31988ed74b821b3a7ca6647188446992aafc/packages/opencode/src/session/reminders.ts#L11-L81)).
- <a id="ref-22"></a>[22] Kimi Code: default system template covering communication, tools, risk, delivery, compaction, and project context ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/app/agentProfileCatalog/system.md#L1-L81)).
- <a id="ref-23"></a>[23] Kimi Code: prompt variables, skills, plugin trust language, and environment fields ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/app/agentProfileCatalog/profile-shared.ts#L104-L187)).
- <a id="ref-24"></a>[24] Kimi Code: shared base with default, coder, and explore profile overlays and tool sets ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/session/agentLifecycle/profile/profiles.ts#L1-L124)).
- <a id="ref-25"></a>[25] Kimi Code: read-only plan profile responsibilities and tool limits ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/features/plan/profile/plan.ts#L1-L42)).
- <a id="ref-26"></a>[26] Kimi Code: user `SYSTEM.md` can replace or compose with the base prompt ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/workspace/workspaceAgentProfileLoader/internal/systemFile.ts#L17-L58)).
- <a id="ref-27"></a>[27] Kimi Code: custom agents inherit the shared prompt renderer ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/workspace/workspaceAgentProfileLoader/internal/agentProfileFromFile.ts#L12-L34)).
- <a id="ref-28"></a>[28] Kimi Code: plugin prompt validation, path resolution, and size limits ([code](https://github.com/moonshotai/kimi-code/blob/f9ca33376604ae91ea35a4ac1d6f1d4425a5aead/packages/agent-core-v2/src/app/plugin/manifest.ts#L266-L334)).
- <a id="ref-29"></a>[29] Gemini CLI: typed `SystemPromptOptions` and high-level section composer ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L43-L180)).
- <a id="ref-30"></a>[30] Gemini CLI: prompt generation from modes, tools, model, skills, sandbox, and Git state ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/promptProvider.ts#L47-L282)).
- <a id="ref-31"></a>[31] Gemini CLI: safety, untrusted context, context efficiency, engineering standards, and intent classification ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L198-L270)).
- <a id="ref-32"></a>[32] Gemini CLI: research/strategy/execution workflow and operational tool rules ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L347-L439)).
- <a id="ref-33"></a>[33] Gemini CLI: subagent orchestration, concurrency safety, and skill activation ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L273-L335)).
- <a id="ref-34"></a>[34] Gemini CLI: plan-mode read-only rules, consultation, storage, and approval flow ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L598-L649)).
- <a id="ref-35"></a>[35] KQode: current static system prompt and OpenAI-compatible/Anthropic request mapping ([code](https://github.com/kefeiqian/kqode-cli/blob/28b8fcb69d0c4cc046d2e9ab7249e52da6acec80/src/llm/api.rs#L13-L16), [code](https://github.com/kefeiqian/kqode-cli/blob/28b8fcb69d0c4cc046d2e9ab7249e52da6acec80/src/llm/api.rs#L134-L160)).
- <a id="ref-36"></a>[36] Gemini CLI: global, private-project, extension, and project memory precedence ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L524-L576)).
- <a id="ref-37"></a>[37] Gemini CLI: per-section prompt feature flags ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/utils.ts#L104-L113)).
- <a id="ref-38"></a>[38] Gemini CLI: sandbox recovery, YOLO mode, and Git-operation constraints ([code](https://github.com/google-gemini/gemini-cli/blob/85aca163f6c73ac6ce380b5447359146b8adcae4/packages/core/src/prompts/snippets.ts#L440-L522)).
- <a id="ref-39"></a>[39] Pi Coding Agent: generated default, custom, and appended system prompt structure ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/system-prompt.ts#L11-L171)).
- <a id="ref-40"></a>[40] Pi Coding Agent: rebuilding tool summaries, guidelines, skills, and context from the active registry ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/agent-session.ts#L1050-L1098)).
- <a id="ref-41"></a>[41] Pi Coding Agent: project context discovery across override, normal, and ancestor files ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/resource-loader.ts#L53-L159)).
- <a id="ref-42"></a>[42] Pi Coding Agent: trusted-project and user-level system prompt discovery order ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/resource-loader.ts#L1023-L1048)).
- <a id="ref-43"></a>[43] Pi Coding Agent: on-demand skill catalog and model-invocation filtering ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/skills.ts#L331-L399)).
- <a id="ref-44"></a>[44] Pi Coding Agent: extensions can inspect and replace the system prompt before agent start ([code](https://github.com/earendil-works/pi/blob/9841914c71a74d81abe07f751aefd271fd924e63/packages/coding-agent/src/core/extensions/runner.ts#L1134-L1193)).
- <a id="ref-45"></a>[45] KQode: Copilot CLI adapter disables custom instructions, MCP, user questions, and tools, then serializes conversation history into one prompt ([code](https://github.com/kefeiqian/kqode-cli/blob/28b8fcb69d0c4cc046d2e9ab7249e52da6acec80/src/llm/copilot_cli/mod.rs#L20-L91)).

[ref-1]: #ref-1
[ref-2]: #ref-2
[ref-3]: #ref-3
[ref-4]: #ref-4
[ref-5]: #ref-5
[ref-6]: #ref-6
[ref-7]: #ref-7
[ref-8]: #ref-8
[ref-9]: #ref-9
[ref-10]: #ref-10
[ref-11]: #ref-11
[ref-12]: #ref-12
[ref-13]: #ref-13
[ref-14]: #ref-14
[ref-15]: #ref-15
[ref-16]: #ref-16
[ref-17]: #ref-17
[ref-18]: #ref-18
[ref-19]: #ref-19
[ref-20]: #ref-20
[ref-21]: #ref-21
[ref-22]: #ref-22
[ref-23]: #ref-23
[ref-24]: #ref-24
[ref-25]: #ref-25
[ref-26]: #ref-26
[ref-27]: #ref-27
[ref-28]: #ref-28
[ref-29]: #ref-29
[ref-30]: #ref-30
[ref-31]: #ref-31
[ref-32]: #ref-32
[ref-33]: #ref-33
[ref-34]: #ref-34
[ref-35]: #ref-35
[ref-36]: #ref-36
[ref-37]: #ref-37
[ref-38]: #ref-38
[ref-39]: #ref-39
[ref-40]: #ref-40
[ref-41]: #ref-41
[ref-42]: #ref-42
[ref-43]: #ref-43
[ref-44]: #ref-44
[ref-45]: #ref-45
