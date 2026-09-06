---
date: 2026-09-04
updated: 2026-09-05
topic: first-tool-payload
question: "这些 coding agent 在什么时候第一次把 tool 数据传给模型；第一次请求是全量传入，还是根据 user prompt 选择性传入？"
status: complete
---

# 首次模型请求如何携带工具

## Summary

六个实现都会在**第一次模型调用前**组装工具数据，不会等到模型先回复一次才提供工具。主流默认行为不是根据自然语言 prompt 在宿主侧做语义筛选，而是把当前会话中**已启用、可见、符合模型与策略约束**的工具集合整体传入。 [\[3\]][ref-3] [\[10\]][ref-10] [\[16\]][ref-16] [\[23\]][ref-23] [\[31\]][ref-31] [\[37\]][ref-37]

差异主要在“可见集合”如何定义：OpenCode、Gemini CLI、Pi 和 DeepSeek Harness 的 native 模式接近全量传入；Codex 只传直接暴露的工具，可把其余工具放在 `tool_search` 后按需发现；Kimi Code 在支持动态工具加载的模型上，第一次只传内联工具和 `select_tools`，由模型理解 prompt 后再请求具体工具 schema。Gemini CLI 还允许 `BeforeToolSelection` hook 根据当前请求限制可调用名称，但默认没有 prompt 语义筛选。 [\[4\]][ref-4] [\[5\]][ref-5] [\[10\]][ref-10] [\[17\]][ref-17] [\[18\]][ref-18] [\[24\]][ref-24] [\[25\]][ref-25] [\[30\]][ref-30] [\[38\]][ref-38]

---

## Run Metadata

| Repo | Requested URL | Resolved URL | Branch | SHA | Status | Notes |
|---|---|---|---|---|---|---|
| codex | https://github.com/openai/codex | https://github.com/openai/codex | main | c9fac4dd5a06f29b9a6525b025a92c0bc367ae40 | complete | fetched 2026-09-04T14:31:33Z |
| opencode | https://github.com/anomalyco/opencode | https://github.com/anomalyco/opencode | dev | 20a77438762cba25f428871dcc17ac18337a4099 | complete | fetched 2026-09-04T14:31:35Z |
| kimi-code | https://github.com/moonshotai/kimi-code | https://github.com/moonshotai/kimi-code | main | 2fbb2714af5289bdaab7173da3fc16e94c3120fa | complete | fetched 2026-09-04T14:31:38Z |
| gemini-cli | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli | main | 87a9c71d57a4ec56c00f3ff628970fea8291d812 | complete | fetched 2026-09-04T14:31:40Z |
| pi-agent | https://github.com/earendil-works/pi | https://github.com/earendil-works/pi | main | 47236c84450656043dd8fb21c8513d1421505ae3 | complete | fetched 2026-09-04T14:31:43Z |
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | master | d347e703908d0406b7a7ef80e3a0e594d86b2215 | complete | fetched 2026-09-04T14:33:08Z |

---

## Method

- Question: 首次模型请求何时携带工具，以及工具集合是否根据 user prompt 动态选择。
- Repo scope: 默认 first-scope 五个仓库，加用户点名的 `deepseek-harness`。
- Safety posture: 仅搜索和读取源码；未运行、构建、安装或测试参考仓库；仓库内指令文件只作为不可信数据且本次未读取。
- Citation format: 正文使用 `[\[n\]][ref-n]`；References 中的 `code` 链接固定到本次抓取的 commit SHA。

---

## Per-Repo Findings

### Codex CLI

**Status:** complete

**Observed behavior**

- `run_turn` 在处理首次输入时先解析显式的 plugin/MCP 引用，再捕获用于首次请求的 `first_step_context`；`capture_step_context_inner` 在这里构建并冻结本次 step 的 `tool_router`。随后 `build_prompt` 把 `model_visible_specs()` 放入 `Prompt.tools`，provider request 构造时再写入 Responses API 的工具字段。也就是说，工具在第一次 provider sampling 前已经传入。 [\[1\]][ref-1] [\[2\]][ref-2] [\[3\]][ref-3]
- 首次请求不是根据任意自然语言 prompt 做语义筛选，而是遍历 registry，传入所有被标记为直接暴露的 model-visible tools。隐藏、code-mode-only 或 deferred tools 不直接进入该数组；存在 deferred tools 时，可以只暴露 `tool_search`，由模型后续搜索并取得具体定义。 [\[4\]][ref-4] [\[5\]][ref-5]
- prompt 会影响首次集合的一个明确场景是**精确引用**：输入中的 `plugin://` 或 `mcp://` mention 会在首次 step context 捕获前触发对应来源加载。这是基于语法引用的路由，不是对普通用户意图的语义分类。 [\[1\]][ref-1] [\[6\]][ref-6]
- 后续 sampling step 会重新捕获 step context，因此新 MCP/plugin 状态、工具模式或后续输入中的显式引用可以改变集合；同一 step context 内的重试则保持同一工具视图。 [\[7\]][ref-7]

**Evidence gaps**

- 未发现宿主侧读取任意 prompt 语义并在第一次请求前挑选直接暴露工具子集的实现。

### OpenCode

**Status:** complete

**Observed behavior**

- 每次模型循环中，`SessionPrompt.run` 都先调用 `SessionTools.resolve`。该函数取得当前 model/agent/session 对应的内置工具、MCP 工具和扩展工具，再由 `LLMRequestPrep.prepare` 应用权限及显式 caller 过滤，最后把整个剩余 map 同时作为 `activeTools` 和 `tools` 传给 `streamText`。 [\[8\]][ref-8] [\[9\]][ref-9] [\[10\]][ref-10]
- 没有发现根据当前 prompt 文本做语义子集选择的内置路径。会删除工具的是显式 `tools[name] = false` 输入，以及合并后的 agent/session permission 中对整个工具的 deny；这两者都是配置或 API 控制，不是从 prompt 意图推断。 [\[10\]][ref-10] [\[11\]][ref-11]
- 实验性 code mode 会改变暴露形式：直接 MCP tools 不再逐个加入请求，而是把可见 MCP catalog 放进 `execute` 的描述，通过统一执行面访问。这仍然不是 prompt 语义检索。 [\[12\]][ref-12]
- 工具会在每次 loop iteration 重新 resolve，因此 agent、permissions、MCP 连接、plugins、feature flags 或 registry 状态变化后，后续请求的集合可以变化。 [\[8\]][ref-8]

**Evidence gaps**

- 默认路径最终依赖外部 AI SDK 序列化 HTTP body；仓库内可直接确认完整过滤后 map 被传给 `streamText`。可选 native runtime 则明确把每个 `request.tools` 项映射到 OpenAI wire `tools`。 [\[13\]][ref-13]

### Kimi Code CLI

**Status:** complete

**Observed behavior**

- 每个 loop step 调用 `llmRequester.start`；`resolveRequest` 选择显式 override 或 `defaultTools()`，后者读取当前完整 agent registry 并经过 `toolSelect.shapeTools`。最终 provider 在第一次调用前构造顶层 `tools`。 [\[14\]][ref-14] [\[15\]][ref-15] [\[16\]][ref-16]
- 未启用动态加载时，`shapeTools` 返回全部 active entries，因此第一次请求传入策略过滤后的完整 active registry。启用动态加载需要模型同时支持 tool use 和 `dynamically_loaded_tools`，并打开对应 feature；此时第一次请求保留内联工具和 `select_tools`，MCP/deferred tools 不直接出现在顶层工具数组。 [\[17\]][ref-17]
- Kimi 有六个实现中最明确的 prompt-responsive 按需加载路径：先向模型告知可动态加载的工具名称，模型理解用户需求后调用 `select_tools`，选中的 schema 被写入下一次请求的系统上下文消息。选择动作来自模型，而不是宿主在首次请求前运行 prompt classifier。 [\[18\]][ref-18] [\[19\]][ref-19] [\[20\]][ref-20]
- 每次请求都会重新读取当前 registry；动态加载模式下，后续请求还会包含模型通过 `select_tools` 选择的 schema，所以后续工具上下文按设计会变化。 [\[15\]][ref-15] [\[17\]][ref-17]

**Evidence gaps**

- 无影响主要结论的证据缺口。

### Gemini CLI

**Status:** complete

**Observed behavior**

- `startChat` 调用 `ToolRegistry.getFunctionDeclarations()`，用完整 declaration array 初始化 `GeminiChat`；模型路由结束后，`setTools(modelToUse)` 会按最终 model ID 重建声明。发送前，`GeminiChat` 把该数组放入 `GenerateContentConfig.tools` 并交给 content generator。 [\[21\]][ref-21] [\[22\]][ref-22] [\[23\]][ref-23]
- 默认情况下，`getFunctionDeclarations(modelId)` 遍历全部 active tools，应用 main-agent、policy、approval mode、MCP resource 和 model-specific schema 等过滤后返回完整数组；没有默认的 prompt 语义预选。 [\[24\]][ref-24]
- 可选的 `BeforeToolSelection` hook 在每次 provider dispatch 前收到包含当前 `contents` 的模型请求，可以返回 `AUTO`、`ANY`、`NONE` 和 `allowedFunctionNames`。因此自定义 hook 可以根据 prompt 限制可调用工具；但观察到的 contract 修改的是 `toolConfig`，不是替换 declaration array。 [\[25\]][ref-25] [\[26\]][ref-26]
- hook 每次请求都运行，model 变化也会触发工具重建，所以后续请求的允许名称或声明集合可能变化。 [\[22\]][ref-22] [\[25\]][ref-25]

**Evidence gaps**

- API-key/Vertex 直连路径的最终 JSON 序列化位于外部 `@google/genai` SDK；仓库内可确认 `config.tools` 进入 `generateContentStream`，Code Assist path 另有明确的 request mapping。 [\[27\]][ref-27]

### Pi Coding Agent

**Status:** complete

**Observed behavior**

- session 创建时根据显式 `options.tools`、`noTools`、settings、默认内置工具和 exclusions 决定 active tools；`AgentSession` 建立 registry 后设置 active names。用户 prompt 启动 agent loop 时，`createContextSnapshot` 把完整 active array 复制到 `AgentContext.tools`，随后直接交给 LLM stream function。 [\[28\]][ref-28] [\[29\]][ref-29] [\[30\]][ref-30]
- 代表性的 OpenAI Responses adapter 会在第一次 `client.responses.create` 前，把 `context.tools` 中每个即时工具映射到 `params.tools`。没有发现 generic loop 对当前 prompt 做语义工具筛选。 [\[31\]][ref-31]
- registry 可以包含比 active set 更多的定义；真正传入的是显式 active names 对应的完整集合。CLI flags、settings、extension/custom tools 和 `setActiveToolsByName` 会改变 active set，但这些都不是 prompt 意图分类。 [\[32\]][ref-32] [\[33\]][ref-33]
- active-tool 变更会在下一 agent turn 生效；普通 tool-result continuation 通常保持集合不变，显式 active-tool 更新或 extension registry refresh 后则可能变化。 [\[32\]][ref-32] [\[34\]][ref-34]

**Evidence gaps**

- Pi 有多个 provider adapter；报告以 OpenAI Responses path 作为具体 wire-field 追踪，其他 provider 共享 generic `Context.tools` 输入。

### DeepSeek Harness

**Status:** complete

**Observed behavior**

- 每个 step 的 `preStep` 都调用 `systemPrompt.assemble`；assembler 收集全部 active tool providers、复制并排序 schemas，生成 `PromptAssembly.tools`。`step` 随后在第一次 LLM 调用前把该集合传给 `buildRequest`，DeepSeek adapter 再把每个 schema 映射为 OpenAI-style function object。 [\[35\]][ref-35] [\[36\]][ref-36] [\[37\]][ref-37]
- 暴露方式取决于 presentation mode：`native` 传全部 scope-visible schemas；`ptc` 顶层只传 `run_code`，实际 catalog 通过 prompt 内代码 SDK 表达；`both` 同时传 native schemas 和 `run_code`。每种模式内部都是完整可见集合的投影，不会根据当前 prompt 选择子集。 [\[38\]][ref-38]
- 未发现内置 prompt-semantic selector。`system-prompt/assemble` waterfall 可以修改工具集合，但标准 assembly context 不包含本次 claimed user messages；插件若通过其他状态实现 prompt-aware 修改，属于扩展行为，不是观察到的默认路由。 [\[35\]][ref-35] [\[39\]][ref-39]
- 每个 step 都重新 assemble，因此 scope restrictions、subagent `toolFilter`、registrations、presentation mode 或 plugin waterfall 变化后，下一请求可以得到不同集合；同一 assembled step 内的 retry 复用固定 assembly。 [\[35\]][ref-35] [\[40\]][ref-40]

**Evidence gaps**

- 无影响主要结论的证据缺口。

---

## Cross-Repo Comparison

| Dimension | Codex | OpenCode | Kimi Code | Gemini CLI | Pi Coding Agent | DeepSeek Harness | Confidence |
|---|---|---|---|---|---|---|---|
| 第一次何时传 tools | 首次 step context 捕获后，第一次 sampling 前。 [\[1\]][ref-1] [\[3\]][ref-3] | 每次 loop 中 resolve/filter 后，调用 `streamText` 前。 [\[8\]][ref-8] [\[10\]][ref-10] | 每个 step resolve/shape 后，provider call 前。 [\[14\]][ref-14] [\[16\]][ref-16] | chat 初始化/模型路由后，dispatch 前写入 config。 [\[21\]][ref-21] [\[23\]][ref-23] | prompt 建立 context snapshot 后，provider call 前。 [\[30\]][ref-30] [\[31\]][ref-31] | 每个 step assemble 后，LLM stream 前。 [\[35\]][ref-35] [\[37\]][ref-37] | high |
| 默认首次集合 | 全部直接暴露的 model-visible tools。 [\[4\]][ref-4] | 全部 resolve 后未被过滤的 tools。 [\[9\]][ref-9] [\[10\]][ref-10] | 非动态模式为全部 active tools。 [\[17\]][ref-17] | 全部 active declarations。 [\[24\]][ref-24] | 完整 active tool array。 [\[29\]][ref-29] [\[30\]][ref-30] | native 为全部 scope-visible schemas。 [\[38\]][ref-38] | high |
| 是否按 prompt 语义预选 | 否；仅精确 URI mentions 会预加载来源。 [\[6\]][ref-6] | 未发现。 [\[10\]][ref-10] | 宿主不预选；动态模式由模型调用 `select_tools`。 [\[18\]][ref-18] [\[19\]][ref-19] | 默认否；自定义 hook 可按 contents 限制名称。 [\[25\]][ref-25] [\[26\]][ref-26] | 未发现。 [\[30\]][ref-30] | 默认否；插件 waterfall 理论上可扩展。 [\[39\]][ref-39] | high |
| 内置按需发现 | `tool_search` 搜索 deferred tools。 [\[5\]][ref-5] | 无；code mode 是统一执行面。 [\[12\]][ref-12] | `select_tools` 加载 deferred/MCP schemas。 [\[18\]][ref-18] [\[20\]][ref-20] | 无默认检索；hook 只限制调用。 [\[26\]][ref-26] | 无。 [\[32\]][ref-32] | PTC 把 catalog 转为代码 SDK，但不做语义检索。 [\[38\]][ref-38] | high |
| 后续集合是否可变 | step recapture 时可变。 [\[7\]][ref-7] | 每次 loop 重新 resolve。 [\[8\]][ref-8] | 每次 request 重算，且选择后加载 schema。 [\[17\]][ref-17] | hook/model/tool refresh 可改变。 [\[22\]][ref-22] [\[25\]][ref-25] | 显式 active-tool 更新在下一 turn 生效。 [\[32\]][ref-32] | 每 step 重新 assemble。 [\[35\]][ref-35] | high |

---

## Follow-up Deep Dive

### Tools 通常不是 system prompt

模型请求中通常存在三条独立通道：

```text
instructions / system
  → agent 身份、行为规则和约束

messages / input / contents
  → 用户任务、assistant 历史、tool results

tools / functions
  → 可调用函数的名称、描述和参数 schema
```

Native tool calling 一般把 schema 放在独立的 `tools` 字段，与 system instructions 和 user messages 并列。Codex 的标准 Responses path、OpenCode 的 AI SDK path、Gemini 的 `GenerateContentConfig.tools`、Pi 的 provider context 和 DeepSeek native mode 都属于这种方式。 [\[3\]][ref-3] [\[10\]][ref-10] [\[23\]][ref-23] [\[31\]][ref-31] [\[37\]][ref-37]

概念请求如下：

```json
{
  "instructions": "You are a coding agent...",
  "input": [
    {
      "role": "user",
      "content": "读取 Cargo.toml"
    }
  ],
  "tools": [
    {
      "type": "function",
      "name": "read_file",
      "description": "Read a workspace file",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

模型同时读取 user prompt 和 tools schema，自行决定直接回答还是产生结构化 tool call。宿主执行后，再把结果作为 tool result 加入下一次模型请求。

Codex Responses Lite 是一个传输例外：它把结构化 `AdditionalTools` item 插入 developer input，而不是使用顶层 `tools` 字段。该 item 仍然保存结构化工具定义，不等于把工具 schema 改写成普通自然语言 system prompt。 [\[3\]][ref-3]

### Codex：从 Registry 到 Responses API

Codex 的工具链可分为五层：

```text
Tool Registry
    ↓
Exposure Policy
    ↓
ToolRouter in immutable StepContext
    ↓
Prompt.tools = model_visible_specs()
    ↓
Responses API request
```

#### 1. Tool Registry

`build_tool_router` 创建 registry，并收集 core、MCP、extension、dynamic 和 hosted tools。Registry entry 同时保留模型 schema 的来源、执行 runtime/handler 和 exposure 状态；因此它既服务于“向模型展示”，也服务于“模型调用后的执行路由”。 [\[41\]][ref-41]

Registry 表示宿主当前知道的工具全集，不代表全部工具都要进入本次模型请求。例如，某些工具可能因为 session role、feature、模型能力、MCP 状态、namespace 支持或 code mode 而不可见。 [\[41\]][ref-41] [\[4\]][ref-4]

#### 2. Exposure Policy

Codex 为工具计算暴露方式，主要语义如下：

| Exposure | 模型侧含义 |
|---|---|
| `Hidden` | 不可见 |
| `DirectModelOnly` | 作为原生模型工具直接暴露 |
| `Direct` | 直接暴露，也可参与 code mode |
| `DeferredModelOnly` | 不直接暴露，可通过搜索发现 |
| `Deferred` | 延迟发现，也可参与 code mode |
| `CodeModeOnly` | 仅通过 code mode 呈现 |

MCP 配置中的 `omit_tools_from`、direct-only namespaces、当前 tool mode 和 `tool_search` 能力共同决定最终 exposure。当搜索可用且工具允许 deferred 时，policy 可以移除 `DIRECT`、保留 `DEFERRED`，避免第一次请求携带其完整 schema。 [\[5\]][ref-5]

例如：

```text
Registry:
  shell                       Direct
  apply_patch                 Direct
  github.search_issues        Deferred
  github.get_pull_request     Deferred
  internal_admin              Hidden

First request:
  shell
  apply_patch
  tool_search
```

用户输入中的精确 `plugin://` 或 `mcp://` mention 会在首次 step context 捕获前加入 required servers/plugins，使相应来源有机会参与 registry 构建。这是显式引用路由，不是对任意自然语言意图做宿主侧分类。 [\[1\]][ref-1] [\[6\]][ref-6]

#### 3. ToolRouter 与固定 StepContext

准备好本 step 的 MCP runtime、environment 和 extension data 后，Codex 构建 `ToolRouter` 并放入 `StepContext`。`ToolRouter` 同时持有模型可见 specs、实际工具 handler 路由和 deferred search 所需信息。 [\[2\]][ref-2] [\[42\]][ref-42]

固定 step snapshot 的关键不变量是：

```text
本次请求中模型看到的 schema
              =
本次响应中 tool call 使用的执行路由
```

同一 step 内的请求、重试和 tool-call validation 使用同一 router；下一 sampling step 才重新捕获 context，以接纳新的 MCP、plugin、policy 或 registry 状态。 [\[7\]][ref-7] [\[42\]][ref-42]

#### 4. `model_visible_specs()`

`build_model_visible_specs` 遍历 registry，仅保留 `exposure.is_direct()` 的 entries，再应用 code-mode visibility、model-specific schema adaptation、hosted specs 和 namespace capability。最终得到本次请求直接可见的 `Vec<ToolSpec>`。 [\[4\]][ref-4]

```rust
Prompt {
    input,
    tools: step_context.tool_router.model_visible_specs(),
    parallel_tool_calls: true,
    base_instructions,
    ...
}
```

因此 `Prompt.tools` 与 `base_instructions` 是两个独立字段；普通 Codex path 没有把 tool specs 拼进 system prompt。 [\[43\]][ref-43]

#### 5. Responses API serialization

标准 path 把 `base_instructions`、conversation `input` 和 `Prompt.tools` 分别写入 request：

```text
ResponsesApiRequest
├─ instructions
├─ input
├─ tools
├─ tool_choice: "auto"
└─ parallel_tool_calls
```

模型可以直接调用 direct tool，也可以先调用 `tool_search` 搜索 deferred metadata，再取得并调用具体工具。选择发生在主模型理解 prompt 之后，而不是 Codex 宿主在第一次请求前运行语义 classifier。 [\[3\]][ref-3] [\[44\]][ref-44]

### PTC：SDK、`run_code` 与内部 Tool Registry

PTC 在 DeepSeek Harness 中是 `Programmatic Tool Calling` 风格的工具呈现模式，不是网络协议，也不替代 MCP。MCP 可以继续承担宿主与外部 tool server 的通信；PTC 只改变模型看到和编排工具的方式。 [\[38\]][ref-38]

纯 PTC 模式同时向模型提供两部分：

```text
System prompt
├─ 只能直接调用 run_code 的规则
├─ 程序编写与结果返回说明
└─ 当前可见工具生成的 TypeScript/Python SDK

Native tools field
└─ run_code
```

它不是只用一句话告诉模型“存在 PTC”。Harness 会注册 PTC-only rule 和动态 SDK system-prompt section，再从当前 agent scope 的可见工具读取 name、description、input schema 和 output schema，按名称稳定排序，并生成 `ToolArgsMap`、`ToolOutputMap`、`ToolCallError` 和全局 `tools` 对象声明。 [\[45\]][ref-45] [\[46\]][ref-46] [\[54\]][ref-54]

生成内容概念上类似：

```ts
interface ToolArgsMap {
  read_file: {
    path: string;
  };

  run_command: {
    command: string;
  };
}

interface ToolOutputMap {
  read_file: {
    content: string;
  };

  run_command: {
    exitCode: number;
    stdout: string;
    stderr: string;
  };
}

type ToolName = keyof ToolOutputMap;

declare class ToolCallError extends Error {
  readonly toolName: ToolName;
}

declare const tools: {
  [K in ToolName]:
    (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;
};
```

这里的 SDK 不是安装进模型的 npm package，而是模型上下文中的 API 合同。真正的函数实现在宿主侧。模型根据该声明生成程序，并通过唯一的原生工具提交：

```json
{
  "name": "run_code",
  "arguments": {
    "description": "Inspect workspace and run tests",
    "code": "const cargo = await tools.read_file({ path: \"Cargo.toml\" });\nif (cargo.content.includes(\"[workspace]\")) {\n  return await tools.run_command({ command: \"cargo test --workspace\" });\n}\nreturn { skipped: true };"
  }
}
```

执行时，宿主为当前可见 registry entries 建立 `tools.<name>` bindings，并把它们注入 code runtime。程序中的每个内部调用通过 message bridge 回到宿主 Tool Registry，继续经过参数校验、调度、guard/policy、执行和日志链路。 [\[47\]][ref-47]

```text
Model-authored program
    ↓
run_code
    ↓
Code runtime
    ↓
tools.read_file binding
    ↓
Host Tool Registry
    ↓
真实 handler
```

只有程序打印或返回的整理后结果进入外层 `run_code` result；大量中间数据可以留在 runtime 内，从而减少模型往返和上下文回传。 [\[47\]][ref-47]

### Native 与 PTC 的取舍

| Dimension | Native tools | PTC |
|---|---|---|
| 单一、简单调用 | 路径短，最合适 | 多一层 `run_code` |
| 多步、条件、循环、并发 | 需要多次模型往返 | 可由一段程序编排 |
| 参数与执行可观察性 | 每个调用天然独立 | 需要同时记录外层代码和内层调用 |
| Approval | 易于逐调用审批 | 嵌套调用必须继续逐项走 policy |
| 模型要求 | 选择工具并生成参数 | 还需生成正确程序和数据流 |
| 中间结果 | 通常回到模型上下文 | 可留在 runtime 内 |
| 实现复杂度 | 较低 | 需要 code runtime、预算、取消和嵌套 trace |

Native 更适合 `read_file`、单次 shell、单个 patch 等原子操作。PTC 更适合批量读取、条件过滤、并发查询和需要中间计算的复杂编排。对 KQode，Native 应继续作为基础执行协议；PTC 若引入，应是建立在同一 Tool Registry、policy、approval、sandbox 和 trace 之上的可选编排层，而不是第二套绕过安全链路的执行系统。Derived from: [\[47\]][ref-47], [\[48\]][ref-48].

工具数量过多时，不必立即引入 PTC。Codex `tool_search` 和 Kimi `select_tools` 说明 deferred discovery 可以先解决首包 schema 膨胀，同时保留 Native 的简单执行与审批语义。Derived from: [\[5\]][ref-5], [\[18\]][ref-18], [\[20\]][ref-20].

### 模型程序写错时如何处理

DeepSeek Harness 的 code-runtime contract 把失败分为：

| Failure kind | 含义 |
|---|---|
| `exception` | 程序语法/转换失败或运行时抛异常 |
| `timeout` | compute budget 或 wall-clock budget 超限 |
| `abort` | 外层取消 |
| `worker-exit` | worker 崩溃、OOM 或提前退出 |
| `invalid-output` | 返回值不能表示为 lossless JSON |
| `output-limit` | 日志、结果或诊断超出预算 |

`CodeRuntime.run()` 对正常的程序失败返回 resolved `CodeRunResult.error`，而不是让 service method reject；`run_code` 再把它转成 `CODE_RUN_FAILED` tool error，并附带有界日志，使 agent loop 能把错误作为 tool result 返回模型进行自我修正。 [\[49\]][ref-49] [\[50\]][ref-50]

TypeScript path 不运行完整 `tsc`。它使用 Node `stripTypeScriptTypes` 删除可擦除类型后执行 JavaScript：语法错误或 `enum` 等不可擦除语法会在 worker 启动前成为 `exception`；错误参数通常在宿主工具 schema validation 中失败，并以程序内 binding rejection/`ToolCallError` 呈现。 [\[55\]][ref-55] [\[47\]][ref-47]

模型自我修正不是成功保证。KQode 若实现 PTC，应设置总 step/token/time budget、连续失败上限、重复程序检测和 Native fallback，避免模型反复提交同类错误。

### Node Worker 的受控范围

DeepSeek Harness 当前 TypeScript backend 使用 Node `worker_threads`。每次 run 创建 fresh worker，清空 worker environment 和 `execArgv`，限制 V8 old-generation heap，分别设置 event-loop active compute budget 与绝对 wall-clock ceiling，限制输出大小，并在完成、取消、超时或失败时终止 worker。 [\[51\]][ref-51] [\[52\]][ref-52]

Worker 使用 `AsyncFunction` 在 strict mode 下运行 type-stripped JavaScript；`tools` bindings 通过 worker message port 调用 host functions。Host 会验证 message shape、binding 名称和 lossless JSON 参数/结果，未知 binding 或 handler failure 作为 reply error 返回 worker，而不是让 hostile worker message 直接崩溃 host listener。 [\[53\]][ref-53] [\[52\]][ref-52]

这是一种故障和资源 containment，不是强安全边界。源码明确说明模型代码仍具有接近 bash 的信任级别；空环境、heap、timeout 和 worker termination 可以控制泄漏、死循环和崩溃范围，但不能证明代码无法访问 Node ambient capabilities、宿主文件或网络。 [\[51\]][ref-51]

更强的 KQode 运行方案可以按安全强度演进：

```text
Native tool calls
    ↓
受限 workflow DSL
    ↓
独立子进程 + OS sandbox
    ↓
无 ambient authority 的 QuickJS/WASM runtime
    ↓
container 或 microVM（高隔离场景）
```

`node:vm` 或 worker thread 可以改善全局状态隔离和资源控制，但不应单独宣称为不可信代码的安全 sandbox。KQode 的初始 PTC prototype 更适合只开放 read-only bindings；文件写入、shell 和网络写操作必须继续逐个经过现有 policy/approval，成熟后再扩大能力。

---

## KQode Lessons

### Product behavior

- KQode 的默认行为应明确区分“registry 中已注册”“当前会话可见”“本次请求直接暴露”三层。六个实现实际传入的都不是进程内无条件全量 registry，而是经过模型能力、agent role、配置和策略过滤后的可见集合。Derived from: [\[4\]][ref-4], [\[10\]][ref-10], [\[17\]][ref-17], [\[24\]][ref-24], [\[29\]][ref-29], [\[38\]][ref-38].
- UI/trace 应显示首次请求采用的是 `all-visible`、`deferred-search`、`dynamic-select` 还是 `code-surface`，否则用户很难判断某个工具为何没有被模型看到。Derived from: [\[5\]][ref-5], [\[17\]][ref-17], [\[38\]][ref-38].

### Architecture implications

- KQode 可以默认把全部 enabled-and-visible tools 放入首次请求，而不引入宿主侧 prompt classifier；当工具数量或 schema token 成本增大时，再通过统一的 deferred registry 加一个模型驱动的 discovery tool。Codex 和 Kimi 都证明这种边界比隐式语义裁剪更可追踪。Derived from: [\[5\]][ref-5], [\[18\]][ref-18], [\[20\]][ref-20].
- 应在每个 model step 开始时生成不可变的 `ToolExposureSnapshot`，供 request serialization、tool-call validation 和 trace 共用；下一 step 才重新计算。Codex 和 DeepSeek 都采用了接近这一模式的 step-level 固定视图。Derived from: [\[2\]][ref-2], [\[7\]][ref-7], [\[35\]][ref-35].
- 权限审批与 schema visibility 应保持分离：`ask` 通常不意味着隐藏工具，真正的 deny/role/capability policy 才决定是否广告该工具。OpenCode、Gemini 和 DeepSeek 的路径都体现了这一区分。Derived from: [\[10\]][ref-10], [\[24\]][ref-24], [\[40\]][ref-40].

### Evaluation ideas

- 增加首次请求 golden test：给定固定 registry、model capability、agent role 和 policy，断言 wire request 中的工具名称、顺序和 schema hash。Derived from: [\[4\]][ref-4], [\[10\]][ref-10], [\[17\]][ref-17], [\[24\]][ref-24], [\[29\]][ref-29], [\[38\]][ref-38].
- 增加“prompt 不应隐式改变工具集合”测试：仅改变普通自然语言用户文本，默认模式下首次工具集合应保持一致；显式 URI mention、selection hook 或 dynamic discovery 模式则应有单独的可解释变化断言。Derived from: [\[6\]][ref-6], [\[25\]][ref-25], [\[18\]][ref-18].
- 增加 step consistency test：同一 step 的 retry 必须复用相同 exposure snapshot，下一 step 在 registry/policy 更新后才允许变化。Derived from: [\[7\]][ref-7], [\[35\]][ref-35].

### Risks and tradeoffs

- 全量传入可见 schema 最简单、行为稳定，但工具很多时会增加输入 token、降低模型选工具的准确度；deferred discovery 降低首包成本，却增加一次或多次模型工具往返。Derived from: [\[5\]][ref-5], [\[17\]][ref-17].
- 宿主侧 prompt-semantic 预选能进一步减少 schema，但会引入“模型需要工具、路由器却先隐藏工具”的不可恢复失败。六个默认路径普遍没有采用这种机制；若 KQode 将来引入，应保留 fallback discovery tool 和完整 trace。Derived from: [\[4\]][ref-4], [\[10\]][ref-10], [\[24\]][ref-24], [\[30\]][ref-30], [\[38\]][ref-38].

---

## Evidence Gaps

- OpenCode、Gemini CLI 的默认 SDK path 最终 HTTP JSON 序列化位于外部依赖；本报告已追踪到仓库向 SDK 传入完整工具字段的位置，并用仓库内 native/Code Assist path 补充 wire mapping。
- Pi provider 数量较多；报告以 OpenAI Responses adapter 验证具体 wire mapping，未逐个枚举所有 adapter。
- DeepSeek Harness 的 plugin waterfall 允许扩展修改 assembly；没有发现内置 prompt-aware 实现，但无法排除第三方 plugin 自行读取外部会话状态。

---

## References

Body citations use these numbered source references; each entry keeps the code URL behind a compact `code` link.

- <a id="ref-1"></a>[1] Codex CLI: `run_turn` 在首次 step context 前解析显式 plugin/MCP 引用 ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/session/turn.rs#L200-L245)).
- <a id="ref-2"></a>[2] Codex CLI: step context 构建并持有 tool router ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/session/mod.rs#L3585-L3658)).
- <a id="ref-3"></a>[3] Codex CLI: prompt tools 进入 Responses request ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/client.rs#L933-L1025)).
- <a id="ref-4"></a>[4] Codex CLI: 遍历 registry 生成全部直接暴露的 model-visible specs ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/tools/spec_plan.rs#L531-L590)).
- <a id="ref-5"></a>[5] Codex CLI: deferred exposure policy 与 `tool_search` 安装 ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/tools/spec_plan.rs#L195-L265)).
- <a id="ref-6"></a>[6] Codex CLI: 从输入收集显式 plugin/MCP mentions ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/session/turn.rs#L717-L785)).
- <a id="ref-7"></a>[7] Codex CLI: 后续 step 重新捕获 context ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/session/turn.rs#L320-L405)).
- <a id="ref-8"></a>[8] OpenCode: 每个 session loop iteration 解析工具并发起模型处理 ([code](https://github.com/anomalyco/opencode/blob/20a77438762cba25f428871dcc17ac18337a4099/packages/opencode/src/session/prompt.ts#L1085-L1150)).
- <a id="ref-9"></a>[9] OpenCode: `SessionTools.resolve` 汇集内置、resource 和 MCP tools ([code](https://github.com/anomalyco/opencode/blob/20a77438762cba25f428871dcc17ac18337a4099/packages/opencode/src/session/tools.ts#L42-L115)).
- <a id="ref-10"></a>[10] OpenCode: request preparation 应用显式工具与 permission 过滤 ([code](https://github.com/anomalyco/opencode/blob/20a77438762cba25f428871dcc17ac18337a4099/packages/opencode/src/session/llm/request.ts#L140-L214)).
- <a id="ref-11"></a>[11] OpenCode: permission visibility/disabled 规则 ([code](https://github.com/anomalyco/opencode/blob/20a77438762cba25f428871dcc17ac18337a4099/packages/opencode/src/permission/index.ts#L200-L220)).
- <a id="ref-12"></a>[12] OpenCode: code mode 把 MCP catalog 折叠到 `execute` surface ([code](https://github.com/anomalyco/opencode/blob/20a77438762cba25f428871dcc17ac18337a4099/packages/opencode/src/tool/registry.ts#L280-L340)).
- <a id="ref-13"></a>[13] OpenCode: native OpenAI Responses path 映射 request tools ([code](https://github.com/anomalyco/opencode/blob/20a77438762cba25f428871dcc17ac18337a4099/packages/llm/src/protocols/openai-responses.ts#L478-L494)).
- <a id="ref-14"></a>[14] Kimi Code: loop step 启动 LLM requester ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/agent/loop/loopService.ts#L841-L878)).
- <a id="ref-15"></a>[15] Kimi Code: request resolution 选择 override 或 default tools ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts#L650-L704)).
- <a id="ref-16"></a>[16] Kimi Code: OpenAI-compatible provider 构造顶层 tools ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/kosong/provider/bases/openai/openai-legacy.ts#L560-L627)).
- <a id="ref-17"></a>[17] Kimi Code: dynamic loading capability 与 `shapeTools` 策略 ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/agent/toolSelect/toolSelectService.ts#L82-L116)).
- <a id="ref-18"></a>[18] Kimi Code: `select_tools` 接受模型选择的精确名称 ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/agent/tools/select-tools/selectToolsTool.ts#L15-L57)).
- <a id="ref-19"></a>[19] Kimi Code: 动态可加载工具名称 announcement ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/agent/toolSelect/toolSelectAnnouncementsService.ts#L1-L26)).
- <a id="ref-20"></a>[20] Kimi Code: 选中的 schemas 写入后续系统上下文 ([code](https://github.com/moonshotai/kimi-code/blob/2fbb2714af5289bdaab7173da3fc16e94c3120fa/packages/agent-core-v2/src/agent/toolSelect/toolSelectSchemasService.ts#L1-L27)).
- <a id="ref-21"></a>[21] Gemini CLI: `startChat` 用完整 function declarations 初始化 chat ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/core/client.ts#L380-L416)).
- <a id="ref-22"></a>[22] Gemini CLI: 最终 model ID 确定后重建 tools ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/core/client.ts#L775-L805)).
- <a id="ref-23"></a>[23] Gemini CLI: tools 写入 GenerateContent config 并 dispatch ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/core/geminiChat.ts#L950-L1085)).
- <a id="ref-24"></a>[24] Gemini CLI: active tool declarations 的完整收集与过滤 ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/tools/tool-registry.ts#L647-L704)).
- <a id="ref-25"></a>[25] Gemini CLI: dispatch 前运行 `BeforeToolSelection` hook ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/core/geminiChat.ts#L990-L1068)).
- <a id="ref-26"></a>[26] Gemini CLI: hook tool config 支持 mode 与 allowed function names ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/hooks/hookTranslator.ts#L65-L74)).
- <a id="ref-27"></a>[27] Gemini CLI: Code Assist request 映射 tools 与 toolConfig ([code](https://github.com/google-gemini/gemini-cli/blob/87a9c71d57a4ec56c00f3ff628970fea8291d812/packages/core/src/code_assist/converter.ts#L160-L175)).
- <a id="ref-28"></a>[28] Pi Coding Agent: session 创建时决定初始 active tools ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/coding-agent/src/core/sdk.ts#L247-L264)).
- <a id="ref-29"></a>[29] Pi Coding Agent: registry refresh 与 active tool filtering ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/coding-agent/src/core/agent-session.ts#L2650-L2762)).
- <a id="ref-30"></a>[30] Pi Coding Agent: active array 进入 context snapshot 和 LLM context ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/agent/src/agent-loop.ts#L280-L313)).
- <a id="ref-31"></a>[31] Pi Coding Agent: OpenAI Responses adapter 映射全部 context tools ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/ai/src/api/openai-responses.ts#L270-L326)).
- <a id="ref-32"></a>[32] Pi Coding Agent: `setActiveToolsByName` 控制实际 active 集合 ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/coding-agent/src/core/agent-session.ts#L954-L984)).
- <a id="ref-33"></a>[33] Pi Coding Agent: CLI 工具选择与排除 flags ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/coding-agent/src/main.ts#L520-L553)).
- <a id="ref-34"></a>[34] Pi Coding Agent: 下一 turn 刷新当前 active tools ([code](https://github.com/earendil-works/pi/blob/47236c84450656043dd8fb21c8513d1421505ae3/packages/coding-agent/src/core/agent-session.ts#L540-L590)).
- <a id="ref-35"></a>[35] DeepSeek Harness: 每 step 执行 prompt assembly 并建立固定 assembly ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-loop/src/agent.ts#L237-L305)).
- <a id="ref-36"></a>[36] DeepSeek Harness: assembler 收集 active providers 的完整 tool schemas ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/system-prompt/src/index.ts#L536-L605)).
- <a id="ref-37"></a>[37] DeepSeek Harness: DeepSeek adapter 映射 wire tools ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm-deepseek/src/serialize.ts#L340-L376)).
- <a id="ref-38"></a>[38] DeepSeek Harness: native、PTC 与 both presentation modes ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent-tool-presentation/src/index.ts#L35-L74)).
- <a id="ref-39"></a>[39] DeepSeek Harness: standard assembly context 不含 claimed prompt messages ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent/src/dispatch.ts#L163-L181)).
- <a id="ref-40"></a>[40] DeepSeek Harness: scope restrictions 与 allow/deny 交集 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/index.ts#L1062-L1090)).
- <a id="ref-41"></a>[41] Codex CLI: 收集 core、MCP、extension 与 dynamic tools 并应用 MCP exposure policy ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/tools/spec_plan.rs#L125-L265)).
- <a id="ref-42"></a>[42] Codex CLI: `ToolRouter` 持有冻结的 model-visible specs ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/tools/router.rs#L74-L138)).
- <a id="ref-43"></a>[43] Codex CLI: `build_prompt` 分别保存 input、tools 与 base instructions ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/session/turn.rs#L1382-L1398)).
- <a id="ref-44"></a>[44] Codex CLI: `tool_search` 在 deferred metadata 中搜索并返回工具定义 ([code](https://github.com/openai/codex/blob/c9fac4dd5a06f29b9a6525b025a92c0bc367ae40/codex-rs/core/src/tools/handlers/tool_search.rs#L132-L227)).
- <a id="ref-45"></a>[45] DeepSeek Harness: PTC-only instruction 与 TypeScript/Python SDK renderers ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/index.ts#L35-L56)).
- <a id="ref-46"></a>[46] DeepSeek Harness: 从工具 schemas 生成 TypeScript args/output maps 与 `tools` 声明 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/ts-types.ts#L285-L320)).
- <a id="ref-47"></a>[47] DeepSeek Harness: `run_code` 为可见 registry tools 建立 bindings 并交给 code runtime ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/ptc.ts#L560-L645)).
- <a id="ref-48"></a>[48] DeepSeek Harness: PTC sub-dispatch 复用 native concurrency、guard 和 staged execution contract ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/ptc.ts#L333-L455)).
- <a id="ref-49"></a>[49] DeepSeek Harness: code runtime 的结构化 failure taxonomy ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/code-runtime/code-runtime/src/types.ts#L65-L115)).
- <a id="ref-50"></a>[50] DeepSeek Harness: `run_code` 将 runtime failure 转成 `CODE_RUN_FAILED` 并保留有界日志 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/ptc.ts#L620-L643)).
- <a id="ref-51"></a>[51] DeepSeek Harness: Worker runtime 的 Node/type-strip 实现及其 containment-not-security-boundary 声明 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/code-runtime/code-runtime-worker-thread/src/index.ts#L1-L84)).
- <a id="ref-52"></a>[52] DeepSeek Harness: fresh worker、空环境、heap、compute、wall-clock、output 与 termination 控制 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/code-runtime/code-runtime-worker-thread/src/index.ts#L363-L560)).
- <a id="ref-53"></a>[53] DeepSeek Harness: Worker 使用 strict `AsyncFunction` 执行，并通过 message-port namespaces 调用 host bindings ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/code-runtime/code-runtime-worker-thread/src/bootstrap.ts#L316-L421)).
- <a id="ref-54"></a>[54] DeepSeek Harness: 根据当前 scope 动态生成并注册 PTC-only 与 SDK system-prompt sections ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/src/index.ts#L823-L881)).
- <a id="ref-55"></a>[55] DeepSeek Harness: TypeScript type stripping 与 worker 启动前的语法失败处理 ([code](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/code-runtime/code-runtime-worker-thread/src/index.ts#L285-L315)).

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
