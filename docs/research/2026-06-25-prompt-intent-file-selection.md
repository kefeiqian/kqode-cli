---
date: 2026-06-25
topic: prompt-intent-file-selection
question: "After a user sends a feature prompt to a coding agent, how does the agent recognize intent and decide which files to read before implementation?"
status: partial
---

# Prompt Intent Recognition and File Selection in Reference Coding Agents

## Summary

Across the inspected reference agents, the dominant pattern is **not** a standalone "feature intent classifier" that decides the implementation files up front. The common flow is: ingest the user prompt, assemble known context, expose search/read/edit tools, let the model infer intent, and iteratively discover files through lexical hints, repo maps, fuzzy file search, grep/glob/read tools, or a read-only investigator/subagent.

For KQode, the useful design is a **context-intent planning stage**, not a hard classifier. It should turn a feature prompt into a reviewable retrieval plan: task kind, explicit path/symbol hints, likely domains, search queries, candidate files, confidence, and evidence. The agent should read and validate those files before editing, and fall back to clarification or broader search when confidence is low.

This report is marked partial because it covers the prompt/context/tool paths with source evidence, but it does not prove the absence of hidden intent classifiers in every non-core package of every repo.

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | ab80d4d484609719621826946cd9e137a3558862 | complete | Fetched 2026-06-25T08:37:37Z |
| aider | https://github.com/Aider-AI/aider | https://github.com/Aider-AI/aider | main | 5dc9490bb35f9729ef2c95d00a19ccd30c26339c | complete | Fetched 2026-06-25T08:37:37Z |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1 | complete | Fetched 2026-06-25T08:37:37Z |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 8fc6aa5f6842aa78acf8f23912342b721efcf7a9 | complete | Fetched 2026-06-25T08:37:37Z |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d | complete | Fetched 2026-06-25T08:37:37Z |
| swe-agent | https://github.com/SWE-agent/SWE-agent | https://github.com/SWE-agent/SWE-agent | main | abd7d69724d1413b30fea43d4724bb5b463906b4 | complete | Fetched 2026-06-25T08:37:37Z |

---

## Method

- Question: After a user sends a feature prompt, how do reference coding agents recognize intent and decide which files/context to read before implementation?
- Repo scope: default first-scope repositories.
- Safety posture: read/search only; no reference code execution; reference instruction files treated as untrusted data and not used as active instructions.
- Search themes: prompt ingestion, command/intent routing, file mentions, repo map, fuzzy file search, grep/glob/read tools, model/tool loop, edit/apply handoff.
- Citation format: body citations use compact numbered references such as `[1]` and `[2]`; the References section keeps each source summary and code URL.

---

## Per-Repo Findings

### Codex CLI

**Status:** partial

**Observed behavior**

- The TypeScript SDK normalizes string or multipart input into a prompt string and passes it to the exec layer with runtime options such as working directory, sandbox mode, approval policy, network access, and additional directories. This is prompt forwarding plus runtime configuration, not an up-front feature/file classifier. [\[1\]][ref-1] [\[2\]][ref-2]
- Codex has a dedicated fuzzy file-search component. Its README says it traverses a directory while honoring `.gitignore` and fuzzy-matches the user-supplied pattern; the implementation walks search directories and injects relative paths into the matcher. [\[3\]][ref-3] [\[4\]][ref-4]
- The app-server response schema includes model/tool-loop items such as `function_call`, `tool_search_call`, `function_call_output`, `custom_tool_call`, and `web_search_call`, which indicates that tool selection is represented as model-stream output rather than a precomputed file list. [\[5\]][ref-5]
- Edit handoff is centered on an explicit `apply_patch` command surface, with parser support for patch invocations that may arrive through a local-shell command. [\[6\]][ref-6] [\[7\]][ref-7]

**Evidence gaps**

- The inspected evidence covers SDK ingestion, file search, protocol response items, and apply-patch handling. It does not fully trace the server-side turn implementation from `turn/start` through every context builder, so Codex is partial for the full lifecycle.

---

### Aider

**Status:** complete

**Observed behavior**

- Aider's loop reads user input, preprocesses it, and sends it through `send_message`. Preprocessing first detects slash/command input, then checks file mentions and URLs; this is lightweight command/mention routing, not feature-intent classification. [\[8\]][ref-8]
- File mention handling is lexical: it splits user text into words, matches full relative paths and unique basenames, and asks the user whether to add newly mentioned files to the chat. [\[10\]][ref-10]
- Repo-map context is driven by the current message text. Aider extracts mentioned filenames and identifiers, computes current chat/read-only files versus other files, and asks `RepoMap.get_repo_map(...)` to rank or summarize the rest of the repo. [\[9\]][ref-9] [\[15\]][ref-15]
- Prompt assembly combines system/examples/history, repo-map messages, read-only file messages, and chat-file messages before the current turn is sent to the model. [\[11\]][ref-11]
- The model call is made over formatted messages, and edits are later parsed from model output, dry-run checked, prepared, applied, and reported as applied file edits. [\[12\]][ref-12] [\[13\]][ref-13] [\[14\]][ref-14]

**Evidence gaps**

- No dedicated feature-intent classifier was found in the inspected prompt path. The observed file-selection behavior is explicit file mentions, user confirmation, and repo-map ranking.

---

### OpenCode

**Status:** complete

**Observed behavior**

- OpenCode queues prompt submissions, commits non-shell user prompts into the UI/session stream, and calls `input.run(sent, ctrl.signal)` for the active turn. [\[19\]][ref-19]
- The prompt UI supports `@` file mentions by calling `input.findFiles(...)` and converting selected paths into file parts. This is autocomplete/search assistance, not semantic feature classification. [\[20\]][ref-20]
- Prompt templates are expanded by scanning file tokens, resolving paths relative to the worktree, and turning found files or directories into prompt parts. [\[21\]][ref-21]
- File parts become synthetic read-tool context: local file URLs are resolved, optional line ranges may be refined with LSP symbols, the read tool is executed, and its output is inserted into the prompt parts. [\[22\]][ref-22]
- The model/tool loop streams `llm.stream(streamInput)` and drains events; the available tools are built from the tool registry and include read, glob, grep, edit, write, task, search, skill, patch, and optional LSP/plan tools. [\[23\]][ref-23] [\[24\]][ref-24] [\[25\]][ref-25]
- The edit tool validates the target file path, computes diffs, asks permission, writes changes, publishes file events, and returns diff/diagnostic metadata. [\[26\]][ref-26]

**Evidence gaps**

- No dedicated feature-intent classifier was found in the inspected prompt/context/tool path. File selection is observable through `@` mentions, prompt-file expansion, read-tool execution, and model-driven tool calls.

---

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- Prompt submission creates or queues prompt state, converts request content to core parts, and calls `core.rpc.prompt(...)`. Session RPC updates prompt metadata from the raw prompt and dispatches to the selected agent. [\[27\]][ref-27] [\[28\]][ref-28] [\[29\]][ref-29]
- Prompt metadata extraction concatenates text-like parts and redacts/truncates sensitive-looking strings; it does not classify feature intent or choose files. [\[30\]][ref-30] [\[31\]][ref-31]
- The turn loop calls `runTurn` with `buildMessages: () => this.agent.context.messages` and `tools: this.agent.tools.loopTools`. `runTurn` repeatedly executes loop steps until a non-tool stop reason; each step sends messages plus tools to the LLM and runs tool batches when the response contains tool calls. [\[32\]][ref-32] [\[33\]][ref-33] [\[34\]][ref-34]
- Context memory projects full history, with compaction and adjacent user-message merging, into model messages. File discovery is exposed through built-in tools such as Read, Grep, and Glob rather than an automatic file-selection classifier. [\[35\]][ref-35] [\[36\]][ref-36] [\[37\]][ref-37] [\[38\]][ref-38] [\[39\]][ref-39]
- Edit handoff is a concrete file tool: it requires path, old string, and replacement text, resolves write access, reads the file, validates occurrences, writes materialized text, and reports success or errors. [\[40\]][ref-40] [\[41\]][ref-41]
- Kimi does have git-context collection for explore subagents, but that context is collected for subagent orientation and is omitted when unavailable; it is not an intent classifier for selecting feature files. [\[42\]][ref-42] [\[43\]][ref-43]

**Evidence gaps**

- Targeted searches in `agent-core` found no feature/file intent classifier. The observed design is prompt metadata, projected history, loop tools, and model-driven tool execution.

---

### Gemini CLI

**Status:** complete

**Observed behavior**

- Non-interactive CLI mode turns the user query into current messages and calls `geminiClient.sendMessageStream(...)`; `GeminiChat.sendMessageStream` records the user message into history before the model stream. [\[46\]][ref-46] [\[47\]][ref-47]
- System prompt construction includes enabled workflow/tool information such as Codebase Investigator, grep, glob, plan mode, memory paths, sandbox settings, and git context. [\[48\]][ref-48]
- Gemini CLI has a dedicated `codebase_investigator` agent for vague requests, refactoring, comprehensive feature implementation, and codebase questions; it returns file paths/symbols/architectural insights and is restricted to read-only tools: `ls`, `read_file`, `glob`, and `grep`. [\[49\]][ref-49]
- It also loads just-in-time subdirectory context when high-intent tools such as read/list/write/replace/read-many-files access a path. [\[50\]][ref-50]
- The model stream collects `functionCalls`, tracks/consolidates tool-call parts, and hands execution to `ToolExecutor`, which executes the invocation through tool hooks and produces completed tool-call results. [\[51\]][ref-51] [\[52\]][ref-52]
- Write-file handoff builds confirmation details with a diff, validates path access, writes through the filesystem service, and returns tool results. [\[53\]][ref-53]
- Gemini CLI does include classifier strategies, but the visible classifier classifies task complexity for model routing (`flash` versus `pro`) and returns a selected model, not a list of files to read. [\[54\]][ref-54] [\[55\]][ref-55] [\[56\]][ref-56]

**Evidence gaps**

- No separate file-selection classifier was found. The closest explicit classifier is model-routing complexity classification, while file discovery is pushed into investigator/search/read tools and JIT context.

---

### SWE-agent

**Status:** complete

**Observed behavior**

- SWE-agent represents the user's request as a `ProblemStatement`; the text variant returns the raw text and extra fields for prompt-template formatting. [\[58\]][ref-58]
- Agent setup writes the problem statement into the environment, appends a system message, demonstrations, and an instance template rendered with command docs, environment variables, the problem statement, repo name, extra fields, and tool state. [\[59\]][ref-59] [\[60\]][ref-60]
- The main loop repeatedly calls `step()` until done and saves trajectory data along the way. The model is queried with the accumulated history, and output is parsed into thought/action plus optional tool calls. [\[61\]][ref-61] [\[62\]][ref-62]
- The model adapter converts history into chat messages and calls the model over that history; it preserves tool-call messages when present. [\[63\]][ref-63]
- Patch submission is detected from tool output, `/root/model.patch` is read as the submission, edited-file context can be extracted from the patch, and a run hook saves the patch and may apply it with `git apply`. [\[64\]][ref-64] [\[65\]][ref-65] [\[66\]][ref-66]

**Evidence gaps**

- No explicit file-retrieval or feature-intent classifier was found in the inspected loop. SWE-agent relies on prompt templates, environment state, model actions, command/tool parsing, and trajectory state.

---

## Cross-Repo Comparison

| Dimension | Cross-repo pattern | Evidence | Confidence |
|---|---|---|---|
| Prompt ingestion | Prompts are forwarded into a turn/session loop with metadata/runtime setup, not first routed through a feature-file classifier. | Codex normalizes input into exec input; Aider reads/preprocesses input; OpenCode queues/commits prompt; Kimi submits to `core.rpc.prompt`; Gemini sends message stream; SWE-agent stores a problem statement. [\[1\]][ref-1] [\[8\]][ref-8] [\[19\]][ref-19] [\[29\]][ref-29] [\[46\]][ref-46] [\[67\]][ref-67] | high |
| File/context selection | File discovery is mostly iterative and evidence-based: explicit file mentions, repo maps, fuzzy search, prompt-file expansion, read-only investigator/subagent, grep/glob/read tools, and environment state. | Aider file mentions and repo map; Codex fuzzy file search; OpenCode `@` mentions and read-tool expansion; Gemini Codebase Investigator and JIT context; Kimi Read/Grep/Glob; SWE-agent state/template context. [\[10\]][ref-10] [\[9\]][ref-9] [\[3\]][ref-3] [\[20\]][ref-20] [\[22\]][ref-22] [\[49\]][ref-49] [\[38\]][ref-38] [\[59\]][ref-59] | high |
| Intent recognition | The model usually infers implementation intent from prompt plus available context/tools. The only explicit classifier found in this slice is Gemini's model-routing classifier, which selects model complexity, not files. | Gemini classifier prompt/routing returns model choice; other inspected prompt paths show command/file mention parsing or model/tool loops rather than a file classifier. [\[54\]][ref-54] [\[55\]][ref-55] [\[16\]][ref-16] [\[44\]][ref-44] | partial |
| Tool loop | The agent loop is driven by model responses that contain tool calls/actions, then tool execution results feed back into later context. | Codex response items include tool/function calls; Gemini collects function calls and executes tools; Kimi derives `tool_use` from LLM responses and runs tool batches; OpenCode streams LLM events and executes registered tools; SWE-agent parses model output into actions/tool calls. [\[5\]][ref-5] [\[51\]][ref-51] [\[52\]][ref-52] [\[45\]][ref-45] [\[23\]][ref-23] [\[62\]][ref-62] | high |
| Edit/apply path | Edits are not selected by intent classifiers; they are applied through explicit edit/write/patch tools with validation, diffs, approval, or patch handoff. | Aider parses/applies edits; Codex has apply-patch; OpenCode edit asks permission and writes; Kimi edit resolves access and writes; Gemini write-file confirms diff then writes; SWE-agent saves/applies submitted patch. [\[14\]][ref-14] [\[6\]][ref-6] [\[26\]][ref-26] [\[41\]][ref-41] [\[53\]][ref-53] [\[66\]][ref-66] | high |

---

## KQode Lessons

### Product behavior

- KQode should show users a visible **"investigating relevant files"** phase before implementation for broad feature prompts. Reference agents make file discovery visible through file mentions, repo maps, read tools, investigator agents, or action loops rather than silently relying on a single classifier. This matters because users can understand why files were read before edits begin. Derived from Aider's file mention confirmation and repo-map assembly, OpenCode's `@` mention/read expansion, and Gemini's Codebase Investigator. [\[10\]][ref-10] [\[9\]][ref-9] [\[22\]][ref-22] [\[49\]][ref-49]
- KQode should ask a clarification or present candidate files when confidence is low, instead of letting an intent classifier overcommit. Aider already asks before adding mentioned files, and Gemini routes vague/comprehensive feature work to a read-only investigator rather than direct editing. [\[17\]][ref-17] [\[49\]][ref-49]

### Architecture implications

- Implement intent recognition as a typed **ContextIntent** stage that produces `task_kind`, `explicit_paths`, `symbols`, `domain_terms`, `search_queries`, `candidate_files`, `confidence`, and `evidence`, then lets the model/tool loop validate by reading files. This borrows the useful parts of Aider's mention/repo-map ranking, Codex fuzzy file search, Gemini's investigator, and Kimi/OpenCode read/grep/glob tool surfaces without making a brittle hard classifier. [\[9\]][ref-9] [\[3\]][ref-3] [\[49\]][ref-49] [\[39\]][ref-39] [\[25\]][ref-25]
- Keep file selection separate from edit application. The references consistently use explicit edit/write/patch mechanisms after discovery and model response, which matches KQode's planned VFS/policy boundary. [\[14\]][ref-14] [\[26\]][ref-26] [\[53\]][ref-53] [\[6\]][ref-6]
- Use any explicit classifier only for bounded routing decisions such as "simple vs complex", model choice, or "needs investigation before edit"; do not let it be the sole authority on which files matter. Gemini's classifier is scoped to model routing, while file discovery remains tool/subagent based. [\[54\]][ref-54] [\[55\]][ref-55] [\[49\]][ref-49]

### Evaluation ideas

- Add deterministic golden tasks that score whether KQode reads the expected files before editing: direct path mention, unique basename mention, symbol-only prompt, domain-only feature prompt, ambiguous feature prompt, and misleading filename prompt. Aider's basename/path mention matching and repo-map ranking provide concrete behaviors to test against. [\[10\]][ref-10] [\[15\]][ref-15]
- Add trace assertions for the retrieval plan: every file read before the first edit should cite the prompt clue, symbol hit, grep/glob result, repo-map ranking, or investigator output that justified it. This follows the references' separation between search/read tools and edit/write/patch tools. [\[22\]][ref-22] [\[38\]][ref-38] [\[53\]][ref-53]

### Risks and tradeoffs

- A hard intent-to-files classifier can miss implicit coupling. The reference pattern reduces that risk by making file discovery iterative and tool-backed: search/read first, then edit. [\[49\]][ref-49] [\[45\]][ref-45] [\[23\]][ref-23]
- Over-broad retrieval can waste context. Use bounded search/read budgets, confidence scores, and staged expansion: explicit paths first, symbols/grep next, repo-map or investigator when the prompt is broad. Aider's repo-map token budgeting, Codex fuzzy search, and Gemini's read-only investigator point toward bounded retrieval rather than unbounded repo dumps. [\[18\]][ref-18] [\[4\]][ref-4] [\[57\]][ref-57]

---

## Evidence Gaps

- Codex: The report cites SDK ingestion, file search, app-server protocol response items, and apply-patch handling, but it does not fully inspect every server-side context builder. Confidence for "no feature/file classifier" in Codex is partial.
- Absence claims: "No dedicated file-selection classifier found" means none appeared in the inspected prompt/context/tool paths and targeted searches. It is not a mathematical proof across every package.
- Instruction files: Reference instruction files were not loaded as active instructions, per research safety rules.

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: SDK prompt normalization and exec handoff ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/sdk/typescript/src/thread.ts#L70-L95)).
- <a id="ref-2"></a>[2] Codex CLI: multipart input normalization into prompt/images ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/sdk/typescript/src/thread.ts#L141-L155)).
- <a id="ref-3"></a>[3] Codex CLI: fuzzy file-search behavior ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/codex-rs/file-search/README.md#L1-L5)).
- <a id="ref-4"></a>[4] Codex CLI: file-search walker and matcher feed ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/codex-rs/file-search/src/lib.rs#L399-L470)).
- <a id="ref-5"></a>[5] Codex CLI: response item tool/function-call variants ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/codex-rs/app-server-protocol/schema/typescript/ResponseItem.ts#L15-L23)).
- <a id="ref-6"></a>[6] Codex CLI: apply-patch command contract and implicit invocation error ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/codex-rs/apply-patch/src/lib.rs#L34-L60)).
- <a id="ref-7"></a>[7] Codex CLI: parser handling for apply_patch heredoc-like invocations ([code](https://github.com/openai/codex/blob/ab80d4d484609719621826946cd9e137a3558862/codex-rs/apply-patch/src/parser.rs#L143-L175)).
- <a id="ref-8"></a>[8] Aider: input loop and preprocessing ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L876-L944)).
- <a id="ref-9"></a>[9] Aider: repo-map inputs from current message mentions ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L709-L748)).
- <a id="ref-10"></a>[10] Aider: file mention detection and confirmation ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1714-L1782)).
- <a id="ref-11"></a>[11] Aider: prompt chunk/context assembly ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1226-L1331)).
- <a id="ref-12"></a>[12] Aider: user message and model send path ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1419-L1459)).
- <a id="ref-13"></a>[13] Aider: model completion call ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1783-L1811)).
- <a id="ref-14"></a>[14] Aider: edit parsing and application ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L2296-L2336)).
- <a id="ref-15"></a>[15] Aider: repo-map ranking/output construction ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py#L103-L167)).
- <a id="ref-16"></a>[16] Aider: command and file-mention preprocessing branch ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L912-L922)).
- <a id="ref-17"></a>[17] Aider: file mention confirmation prompt ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1761-L1782)).
- <a id="ref-18"></a>[18] Aider: repo-map token budget and ranking loop ([code](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py#L120-L167)).
- <a id="ref-19"></a>[19] OpenCode: prompt queue and turn dispatch ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/cli/cmd/run/runtime.queue.ts#L59-L215)).
- <a id="ref-20"></a>[20] OpenCode: `@` mention file autocomplete ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/cli/cmd/run/footer.prompt.tsx#L360-L405)).
- <a id="ref-21"></a>[21] OpenCode: prompt template file-token expansion ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/prompt.ts#L161-L195)).
- <a id="ref-22"></a>[22] OpenCode: file part resolution through read-tool context ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/prompt.ts#L818-L980)).
- <a id="ref-23"></a>[23] OpenCode: LLM streaming processor ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/processor.ts#L960-L1033)).
- <a id="ref-24"></a>[24] OpenCode: tool registry exposure to model ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/session/tools.ts#L89-L130)).
- <a id="ref-25"></a>[25] OpenCode: built-in tools list ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/tool/registry.ts#L198-L236)).
- <a id="ref-26"></a>[26] OpenCode: edit tool validation, diff, permission, write, diagnostics ([code](https://github.com/anomalyco/opencode/blob/98dcea02a8f36fe71fe894d05e6ed6dcf9365dd1/packages/opencode/src/tool/edit.ts#L58-L213)).
- <a id="ref-27"></a>[27] Kimi Code CLI: prompt submission queue/start ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/services/prompt/promptService.ts#L334-L359)).
- <a id="ref-28"></a>[28] Kimi Code CLI: prompt core RPC handoff ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/services/prompt/promptService.ts#L418-L447)).
- <a id="ref-29"></a>[29] Kimi Code CLI: session prompt RPC dispatch ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/session/rpc.ts#L105-L110)).
- <a id="ref-30"></a>[30] Kimi Code CLI: metadata text extraction ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/session/prompt-metadata.ts#L11-L18)).
- <a id="ref-31"></a>[31] Kimi Code CLI: metadata redaction/truncation ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/session/prompt-metadata.ts#L43-L62)).
- <a id="ref-32"></a>[32] Kimi Code CLI: turn loop calls `runTurn` with context messages and tools ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/agent/turn/index.ts#L622-L647)).
- <a id="ref-33"></a>[33] Kimi Code CLI: repeated loop-step execution ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/loop/run-turn.ts#L48-L128)).
- <a id="ref-34"></a>[34] Kimi Code CLI: LLM call, stop reason, and tool batch execution ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/loop/turn-step.ts#L76-L199)).
- <a id="ref-35"></a>[35] Kimi Code CLI: projected context messages ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/agent/context/index.ts#L216-L222)).
- <a id="ref-36"></a>[36] Kimi Code CLI: history projection/merging ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/agent/context/projector.ts#L6-L28)).
- <a id="ref-37"></a>[37] Kimi Code CLI: Read tool schema ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/tools/builtin/file/read.ts#L25-L45)).
- <a id="ref-38"></a>[38] Kimi Code CLI: Grep tool schema ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/tools/builtin/file/grep.ts#L41-L121)).
- <a id="ref-39"></a>[39] Kimi Code CLI: Glob tool schema and match cap ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/tools/builtin/file/glob.ts#L48-L67)).
- <a id="ref-40"></a>[40] Kimi Code CLI: Edit tool input schema ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/tools/builtin/file/edit.ts#L27-L48)).
- <a id="ref-41"></a>[41] Kimi Code CLI: Edit tool execution ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/tools/builtin/file/edit.ts#L68-L163)).
- <a id="ref-42"></a>[42] Kimi Code CLI: git-context purpose and safety comments ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/session/git-context.ts#L1-L13)).
- <a id="ref-43"></a>[43] Kimi Code CLI: git-context collection behavior ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/session/git-context.ts#L51-L137)).
- <a id="ref-44"></a>[44] Kimi Code CLI: LLM response and tool-use handling ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/loop/turn-step.ts#L102-L137)).
- <a id="ref-45"></a>[45] Kimi Code CLI: tool-use extraction from LLM response ([code](https://github.com/moonshotai/kimi-code/blob/8fc6aa5f6842aa78acf8f23912342b721efcf7a9/packages/agent-core/src/loop/turn-step.ts#L126-L137)).
- <a id="ref-46"></a>[46] Gemini CLI: CLI prompt sent into message stream ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/cli/src/nonInteractiveCli.ts#L305-L326)).
- <a id="ref-47"></a>[47] Gemini CLI: user message recording into chat history ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/core/geminiChat.ts#L375-L443)).
- <a id="ref-48"></a>[48] Gemini CLI: system prompt context/tool workflow sections ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/prompts/promptProvider.ts#L142-L255)).
- <a id="ref-49"></a>[49] Gemini CLI: Codebase Investigator purpose and read-only tools ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/agents/codebase-investigator.ts#L65-L125)).
- <a id="ref-50"></a>[50] Gemini CLI: JIT context for high-intent file/directory tools ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/tools/jit-context.ts#L10-L19)).
- <a id="ref-51"></a>[51] Gemini CLI: stream function-call collection ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/core/geminiChat.ts#L1111-L1280)).
- <a id="ref-52"></a>[52] Gemini CLI: tool execution path ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/scheduler/tool-executor.ts#L61-L198)).
- <a id="ref-53"></a>[53] Gemini CLI: write-file confirmation and execution ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/tools/write-file.ts#L214-L360)).
- <a id="ref-54"></a>[54] Gemini CLI: complexity classifier prompt ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/routing/strategies/classifierStrategy.ts#L27-L80)).
- <a id="ref-55"></a>[55] Gemini CLI: classifier response model selection ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/routing/strategies/classifierStrategy.ts#L176-L219)).
- <a id="ref-56"></a>[56] Gemini CLI: model-router strategy order ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/routing/modelRouterService.ts#L39-L66)).
- <a id="ref-57"></a>[57] Gemini CLI: Codebase Investigator output guidance ([code](https://github.com/google-gemini/gemini-cli/blob/d845bc5d45adad7d7664d9790e5cdbe3ccf1de0d/packages/core/src/agents/codebase-investigator.ts#L112-L125)).
- <a id="ref-58"></a>[58] SWE-agent: problem-statement text and extra fields ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/problem_statement.py#L33-L92)).
- <a id="ref-59"></a>[59] SWE-agent: system/demo/instance template setup ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/agents.py#L600-L673)).
- <a id="ref-60"></a>[60] SWE-agent: tool state collection ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/tools/tools.py#L337-L348)).
- <a id="ref-61"></a>[61] SWE-agent: main action/observation loop and trajectory saving ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/agents.py#L390-L440)).
- <a id="ref-62"></a>[62] SWE-agent: model query and action/tool-call parsing ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/agents.py#L1006-L1052)).
- <a id="ref-63"></a>[63] SWE-agent: history-to-messages and model query path ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/models.py#L794-L872)).
- <a id="ref-64"></a>[64] SWE-agent: submission/action parsing helpers ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/tools/tools.py#L372-L380)).
- <a id="ref-65"></a>[65] SWE-agent: submission patch reading and edited-file context extraction ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/agents.py#L870-L934)).
- <a id="ref-66"></a>[66] SWE-agent: patch save/apply hook ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/run/hooks/apply_patch.py#L18-L110)).
- <a id="ref-67"></a>[67] SWE-agent: problem-statement text return path ([code](https://github.com/SWE-agent/SWE-agent/blob/abd7d69724d1413b30fea43d4724bb5b463906b4/sweagent/agent/problem_statement.py#L68-L92)).

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
[ref-46]: #ref-46
[ref-47]: #ref-47
[ref-48]: #ref-48
[ref-49]: #ref-49
[ref-50]: #ref-50
[ref-51]: #ref-51
[ref-52]: #ref-52
[ref-53]: #ref-53
[ref-54]: #ref-54
[ref-55]: #ref-55
[ref-56]: #ref-56
[ref-57]: #ref-57
[ref-58]: #ref-58
[ref-59]: #ref-59
[ref-60]: #ref-60
[ref-61]: #ref-61
[ref-62]: #ref-62
[ref-63]: #ref-63
[ref-64]: #ref-64
[ref-65]: #ref-65
[ref-66]: #ref-66
[ref-67]: #ref-67
