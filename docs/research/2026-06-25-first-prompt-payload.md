---
date: 2026-06-25
topic: first-prompt-payload
question: "For reference coding agents, what is passed to the agent/model on the first user prompt?"
status: partial
---

# First-Prompt Payloads in Reference Coding Agents

## Summary

Across the inspected reference agents, the first prompt is rarely just the user's text and rarely a full repository dump. The common payload shape is **user prompt + system/developer instructions + available tool descriptions**, with optional bounded context such as repo maps, explicitly attached files, prompt-template file parts, git/workspace metadata, demonstrations, or command docs.

The main difference is where repo context enters. Aider may include a token-budgeted repo map and already-selected chat/read-only files in the first model call. OpenCode expands explicit file parts into synthetic read-tool context. Gemini sends the user message with a rich system instruction and tool list, leaning on Codebase Investigator/JIT reads for repo discovery. Kimi sends projected conversation context and loop tools. SWE-agent preloads a system template, demonstrations, instance template, problem statement, repo name, command docs, and tool state. Codex evidence at the inspected SDK layer shows prompt/images and runtime options passed into the exec layer, but the exact server-side first model payload remains partial.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | ab80d4d484609719621826946cd9e137a3558862 | partial | SDK ingress inspected; exact downstream model payload not fully traced |
| aider | https://github.com/Aider-AI/aider | https://github.com/Aider-AI/aider | main | 5dc9490bb35f9729ef2c95d00a19ccd30c26339c | complete | First message assembly and model call inspected |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1 | partial | Prompt/file expansion, tool exposure, and stream call inspected; exact full stream input construction not fully traced |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 8fc6aa5f6842aa78acf8f23912342b721efcf7a9 | complete | Prompt handoff, context projection, and loop call inspected |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d | complete | Non-interactive first message, system prompt options, tools, and model request inspected |
| swe-agent | https://github.com/SWE-agent/SWE-agent | https://github.com/SWE-agent/SWE-agent | main | abd7d69724d1413b30fea43d4724bb5b463906b4 | complete | Setup history, problem statement, tool state, and model query inspected |

---

## Method

- Question: For reference coding agents, what is passed to the agent/model on the first user prompt?
- Repo scope: default first-scope repositories from `docs/research/2026-06-25-prompt-intent-file-selection.md`.
- Safety posture: read/search only; no code execution; reference instruction files treated as data.
- Citation format: numbered references such as `[\[1\]][ref-1]`; References entries keep commit-pinned source URLs behind compact `code` links.

---

## Per-Repo Findings

### Codex CLI

**Status:** partial

**Observed behavior**

- At the inspected TypeScript SDK boundary, Codex normalizes string or multipart input into a prompt string plus image paths, then calls the exec layer with that prompt, images, model settings, working directory, sandbox mode, network/web-search flags, approval policy, output schema file, and additional directories. This proves the first handoff is not a repo dump at the SDK layer, but does not fully expose the later server-side model request. [\[1\]][ref-1] [\[2\]][ref-2]

**Evidence gaps**

- The exact downstream first model payload after the exec layer is not fully traced in this follow-up. Treat Codex as partial for "what reaches the model."

---

### Aider

**Status:** complete

**Observed behavior**

- Aider preprocesses the first user message for commands, file mentions, and URLs before sending. File and identifier mentions influence the repo map: the repo map is built from current message text, chat files, read-only files, other repo files, mentioned filenames, and mentioned identifiers. [\[3\]][ref-3] [\[4\]][ref-4]
- Aider's first model message set is assembled from a main system prompt, optional example conversations, prior done/history messages, repo-map messages, read-only file messages, chat-file messages, the current user message, and an optional system reminder. The repo map is token-budgeted and can expand to a broader view when no files are already in chat. [\[5\]][ref-5] [\[6\]][ref-6]
- The current user prompt is appended as a user message, all chunks are flattened into model messages, and the completion call receives those messages plus any function/tool definitions. [\[7\]][ref-7] [\[8\]][ref-8]

**Evidence gaps**

- The exact text of Aider's system prompt varies by coder/model configuration and was not reproduced here.

---

### OpenCode

**Status:** partial

**Observed behavior**

- OpenCode queues the user's prompt, commits non-shell prompts into the UI/session stream, and dispatches the turn through `input.run(...)`. Prompt templates can expand file tokens into prompt parts; explicit file parts are resolved by calling the read tool and adding synthetic "Called the Read tool..." and read-output text parts before the model sees them. [\[9\]][ref-9] [\[10\]][ref-10] [\[11\]][ref-11]
- The model call path streams `llm.stream(streamInput)`, while the tool registry exposes model/provider/agent-specific tool descriptions and input schemas for tool execution. This means the first prompt includes tool availability through structured tool definitions, and may include file contents only when explicit file/template parts caused read-tool expansion. [\[12\]][ref-12] [\[13\]][ref-13]

**Evidence gaps**

- This follow-up did not fully trace the construction of `streamInput`, so OpenCode is partial for the exact full first request envelope.

---

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Kimi converts prompt submission content into core parts, preserving text and media-like parts, then sends `{ sessionId, agentId, input }` through `core.rpc.prompt(...)`. The session RPC updates prompt metadata for the main agent and dispatches the payload to the selected agent. [\[14\]][ref-14] [\[15\]][ref-15] [\[16\]][ref-16]
- The turn loop calls `runTurn` with `buildMessages: () => this.agent.context.messages` and `tools: this.agent.tools.loopTools`. The first LLM step awaits projected context messages, then sends `messages` and `tools` in chat parameters. [\[17\]][ref-17] [\[18\]][ref-18]
- Context projection compacts and projects history, merges adjacent user messages from the same user origin, strips context metadata, and omits empty/partial messages. No evidence was found that Kimi preloads a repo tree or file contents into the first prompt by default. [\[19\]][ref-19] [\[20\]][ref-20]

**Evidence gaps**

- The exact initial system/context messages that existed before the first user prompt depend on agent initialization outside the inspected ranges.

---

### Gemini CLI

**Status:** complete

**Observed behavior**

- In non-interactive mode, Gemini starts with `currentMessages` as a user message whose parts are the query, then calls `sendMessageStream` with those parts on the first turn. GeminiChat records the user content in chat history before the model stream. [\[21\]][ref-21] [\[22\]][ref-22]
- The model request includes final contents, a `systemInstruction`, and a tools list in `GenerateContentConfig`. The system prompt provider builds sections for interaction/approval mode, subagents, skills, primary workflows, plan mode, memory paths, sandbox mode, git repository status, and final reminders depending on enabled features. [\[23\]][ref-23] [\[24\]][ref-24]
- Gemini's Codebase Investigator is advertised as a specialized read-only analysis agent for vague requests, refactors, comprehensive feature work, and codebase questions; it has access only to list/read/glob/grep tools. This is available to the model as a tool/agent rather than being an upfront repo-content dump. [\[25\]][ref-25]

**Evidence gaps**

- The exact rendered system-instruction text depends on enabled sections and runtime config.

---

### SWE-agent

**Status:** complete

**Observed behavior**

- SWE-agent represents the task as a problem statement whose text is available to prompt templates and can also be set into the environment. Before the first model query, setup appends a rendered system template, demonstrations, and an instance template rendered with command docs, configured environment variables, problem statement, repo name, extra fields, and tool state. [\[26\]][ref-26] [\[27\]][ref-27] [\[28\]][ref-28]
- The first model query receives the accumulated history after conversion into chat messages. System messages may be converted to user messages depending on configuration, and tool-call/tool-result history is preserved when present. [\[29\]][ref-29]

**Evidence gaps**

- The exact template text and demonstration content depend on SWE-agent configuration.

---

## Cross-Repo Comparison

| Dimension | Codex | Aider | OpenCode | Kimi Code | Gemini CLI | SWE-agent | Confidence |
|---|---|---|---|---|---|---|---|
| User prompt | Normalized to prompt string plus images before exec handoff. | Appended as current user message after preprocessing. | Queued/committed as prompt text and prompt parts. | Converted to core text/media parts and sent to agent. | Sent as first user message parts. | Rendered as problem statement in prompt templates/history. | high |
| Tool descriptions | Runtime/tool details are downstream of inspected SDK layer. | Optional functions/tools are passed with model completion. | Tool descriptions and schemas are exposed from registry. | Loop tools are sent with chat params. | Tools are sent in model config. | Command docs/tool affordances are rendered through templates/tool state. | high |
| Project structure/content upfront | Not proven at SDK layer. | Repo map plus selected chat/read-only files can be included. | Explicit file/template parts can become synthetic read results. | No repo tree/file dump found in inspected first-turn path. | No upfront repo dump; system prompt advertises investigator and read/search tools. | Instance template can include repo name, command docs, environment/tool state, and demos, not a full repo dump by default. | partial |
| First-file discovery posture | Exec/runtime options plus later tools. | File mentions and repo map shape first context. | `@`/template file parts and tools shape first context. | Model uses projected context plus read/grep/glob tools. | Model uses system/tool context and may call Codebase Investigator/JIT read tools. | Model uses command/tool environment loop after initial templates. | high |

---

## KQode Lessons

### Product behavior

- KQode should not send whole project contents on the first prompt. The reference pattern is to send task text, instructions/tool affordances, and bounded or explicit context, then rely on tool-backed discovery for source contents. [\[5\]][ref-5] [\[11\]][ref-11] [\[23\]][ref-23] [\[24\]][ref-24]

### Architecture implications

- KQode's first prompt packet should be split into explicit layers: user message, trusted system/developer instructions, tool descriptions/schemas, bounded project snapshot, and zero or more explicit attachments/read results. This mirrors Aider's chunked message assembly, OpenCode's prompt parts/read expansion, Kimi's projected messages plus tools, and Gemini's contents plus systemInstruction/tools. [\[5\]][ref-5] [\[11\]][ref-11] [\[18\]][ref-18] [\[24\]][ref-24]
- Tool descriptions should be sent with the first model call, but source contents should generally arrive through read/search tool results or explicit file attachments, not through an unbounded snapshot. [\[11\]][ref-11] [\[13\]][ref-13] [\[18\]][ref-18] [\[24\]][ref-24]

### Evaluation ideas

- Add a golden assertion that the first provider request contains a bounded project snapshot and tool schemas but does not include arbitrary source-file content unless the user explicitly attached or mentioned it. This is supported by Aider's repo-map/file-message distinction, OpenCode's explicit file-part expansion, and Gemini/Kimi's tool-first first-turn paths. [\[5\]][ref-5] [\[11\]][ref-11] [\[18\]][ref-18] [\[24\]][ref-24]

### Risks and tradeoffs

- Rich first prompts can improve orientation but increase prompt-injection and leakage risk when repo-derived fragments are mixed with instructions. KQode should trust-label project instructions, manifests, read/search snippets, and generated summaries as repo data unless explicitly promoted by trusted user policy. [\[5\]][ref-5] [\[11\]][ref-11] [\[23\]][ref-23] [\[24\]][ref-24]

---

## Evidence Gaps

- Codex: exact first model request after SDK exec handoff remains partial.
- OpenCode: exact full `streamInput` construction remains partial, although prompt-part expansion, tool exposure, and stream invocation were inspected.
- Configuration-dependent prompts: Aider, Gemini, and SWE-agent render system/templates based on model or runtime config, so this report describes payload shape rather than exact text.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: SDK prompt normalization and exec handoff ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/sdk/typescript/src/thread.ts#L70-L95)).
- <a id="ref-2"></a>[2] Codex CLI: multipart input normalization into prompt/images ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/sdk/typescript/src/thread.ts#L141-L155)).
- <a id="ref-3"></a>[3] Aider: current-message mentions drive repo-map inputs ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L709-L748)).
- <a id="ref-4"></a>[4] Aider: user input preprocessing for commands, file mentions, and URLs ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L912-L922)).
- <a id="ref-5"></a>[5] Aider: prompt chunk/context assembly ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1226-L1331)).
- <a id="ref-6"></a>[6] Aider: repo-map token budgeting and ranked map output ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py#L103-L167)).
- <a id="ref-7"></a>[7] Aider: current user message appended and formatted before send ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1419-L1459)).
- <a id="ref-8"></a>[8] Aider: completion call receives messages and functions ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1783-L1811)).
- <a id="ref-9"></a>[9] OpenCode: prompt queue commits and dispatches user prompt ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/cli/cmd/run/runtime.queue.ts#L170-L215)).
- <a id="ref-10"></a>[10] OpenCode: prompt-template file-token expansion into file parts ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/prompt.ts#L161-L195)).
- <a id="ref-11"></a>[11] OpenCode: file parts resolved into synthetic read-tool context ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/prompt.ts#L818-L980)).
- <a id="ref-12"></a>[12] OpenCode: LLM stream call receives stream input ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/processor.ts#L960-L1033)).
- <a id="ref-13"></a>[13] OpenCode: tool registry exposes descriptions and input schemas ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/tools.ts#L89-L130)).
- <a id="ref-14"></a>[14] Kimi Code CLI: prompt content converted to core parts ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/services/prompt/promptService.ts#L121-L144)).
- <a id="ref-15"></a>[15] Kimi Code CLI: core prompt RPC payload with session, agent, and input parts ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/services/prompt/promptService.ts#L418-L447)).
- <a id="ref-16"></a>[16] Kimi Code CLI: session RPC metadata update and agent prompt dispatch ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/session/rpc.ts#L105-L110)).
- <a id="ref-17"></a>[17] Kimi Code CLI: turn loop uses projected context messages and loop tools ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/agent/turn/index.ts#L622-L647)).
- <a id="ref-18"></a>[18] Kimi Code CLI: LLM chat params include messages and tools ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/loop/turn-step.ts#L76-L122)).
- <a id="ref-19"></a>[19] Kimi Code CLI: context messages are compacted/projected from history ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/agent/context/index.ts#L216-L222)).
- <a id="ref-20"></a>[20] Kimi Code CLI: projection merges adjacent user messages and strips context metadata ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/agent/context/projector.ts#L6-L28)).
- <a id="ref-21"></a>[21] Gemini CLI: non-interactive first turn starts from user query parts ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/cli/src/nonInteractiveCli.ts#L305-L326)).
- <a id="ref-22"></a>[22] Gemini CLI: user message recorded into chat history ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/core/geminiChat.ts#L375-L443)).
- <a id="ref-23"></a>[23] Gemini CLI: system prompt options include workflows, skills, memory, sandbox, and git sections ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/prompts/promptProvider.ts#L142-L255)).
- <a id="ref-24"></a>[24] Gemini CLI: model request includes contents, systemInstruction, and tools ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/core/geminiChat.ts#L744-L918)).
- <a id="ref-25"></a>[25] Gemini CLI: Codebase Investigator purpose and read-only tool set ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/agents/codebase-investigator.ts#L65-L125)).
- <a id="ref-26"></a>[26] SWE-agent: text problem statement and extra fields for templates ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/problem_statement.py#L68-L92)).
- <a id="ref-27"></a>[27] SWE-agent: setup appends system prompt, demonstrations, and instance template ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/agents.py#L600-L673)).
- <a id="ref-28"></a>[28] SWE-agent: tool state collection for environment state ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/tools/tools.py#L337-L348)).
- <a id="ref-29"></a>[29] SWE-agent: history converted into model messages ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/models.py#L794-L872)).

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
