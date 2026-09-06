---
date: 2026-09-06
topic: agent-evaluation-benchmarks
question: "主流 Agent evaluation benchmark 有哪些，哪些适合评测 KQode Coding Agent？"
status: complete
---

# Agent Evaluation Benchmark 调研

## Summary

Agent benchmark 已经从单轮代码生成扩展为仓库级修改、终端操作、浏览器和桌面交互、工具调用、深度研究、企业工作流、安全与长程自治等多个方向。评测 Coding Agent 时，不应只使用 HumanEval 或 LiveCodeBench 这类模型级代码生成题；更有代表性的主指标是 SWE-bench 系列、Terminal-Bench，以及覆盖多语言、重构、新功能和真实商业任务的补充 benchmark。

对当前 KQode，建议先建立 `自有 golden tasks + SWE-bench Verified 子集 + Terminal-Bench 子集 + 多语言 SWE benchmark` 四层评测。它们分别覆盖项目回归、真实 issue 修复、终端执行，以及 Rust/TypeScript 等非 Python 仓库能力。

本文是截至 2026-09-06 的调研快照。benchmark 的数据集、排行榜、题目版本和模型成绩会持续变化，因此正式比较时必须记录数据集版本、agent scaffold、模型版本、预算、运行次数和执行环境。

---

## Run Metadata

| Source group | Scope | Status | Notes |
|---|---|---|---|
| OpenAI | SWE-bench Verified、SWE-Lancer、PaperBench、MLE-bench、BrowseComp 等 | complete | 官方发布、system card 和论文 |
| Anthropic | SWE-bench、Terminal-Bench、OSWorld、tool-use 和安全评测 | complete | 官方模型发布和工程文章 |
| Moonshot AI | Kimi K2/Kimi-Dev 的 coding 与 agentic benchmark | complete | 官方仓库和技术报告 |
| DeepSeek | V3/V3.2 系列的 coding、search 和 tool-agent 评测 | partial | 不同版本公开材料的评测集合不同 |
| Benchmark authors | Coding、terminal、web、GUI、tool-use、research 和 safety benchmark | complete | 官方网站、论文和仓库 |

---

## Method

- Question: 汇总主流 Agent benchmark，并识别适合 KQode Coding Agent 的评测。
- Source scope: 模型厂商官方材料、benchmark 官方网站、原始论文和官方仓库。
- Selection rule: 优先保留有公开任务定义、可执行环境、自动或专家验证方式的 benchmark。
- Safety posture: 仅阅读公开材料；未下载、运行或执行第三方 benchmark 代码。
- Citation format: 正文使用 `[\[n\]][ref-n]`，文末 References 指向官方页面或原始论文。

---

## 模型厂商常用的 Agent Benchmark

| 厂商/模型系列 | 常见公开评测 | 说明 |
|---|---|---|
| OpenAI / ChatGPT / Codex | SWE-bench Verified、SWE-Bench Pro、Terminal-Bench、Aider Polyglot、PaperBench、MLE-bench、SWE-Lancer、BrowseComp、OSWorld、WebArena、WebVoyager | OpenAI 参与发布了 SWE-bench Verified、SWE-Lancer、PaperBench、MLE-bench 和 BrowseComp，并在模型 system card 中持续使用仓库级和长程 Agent 任务。 [\[1\]][ref-1] [\[5\]][ref-5] [\[13\]][ref-13] |
| Anthropic / Claude | SWE-bench Verified、SWE-bench Multilingual、Terminal-Bench、OSWorld、tau-bench，以及内部长程 coding/agent eval | Anthropic 明确把 SWE-bench 和 Terminal-Bench 作为衡量软件工程与长程 Agent 能力的核心公开指标，同时提醒基础设施差异可能显著影响分数。 [\[6\]][ref-6] [\[14\]][ref-14] |
| Moonshot AI / Kimi | SWE-bench Verified、SWE-bench Multilingual、Terminal-Bench、Aider Polyglot、tau2-bench、ACEBench、BrowseComp、HLE | Kimi K2 系列强调 agentic tool use 和软件工程能力；Kimi-Dev 则专门面向真实 issue resolution。 [\[15\]][ref-15] |
| DeepSeek | SWE-bench Verified、Terminal-Bench、ToolBench、BrowseComp、HLE，以及 Search/Code/Code Interpreter/General Agent 任务 | DeepSeek 不同模型版本采用的集合并不完全一致，复现实验时应按具体技术报告固定版本。 [\[16\]][ref-16] |

---

## 直接测试 Coding Agent 的 Benchmark

### 仓库级 Issue Resolution

| Benchmark | 测试内容 | KQode 优先级 |
|---|---|---:|
| **SWE-bench Verified** | 给定真实 GitHub 仓库和 issue，要求生成通过回归测试的 patch；人工复核后的高质量子集 | P0 |
| **SWE-bench** | 原始真实 Python 仓库 issue 数据集 | P1 |
| **SWE-bench Lite** | 较小、整体较容易的 SWE-bench 子集 | P2 |
| **SWE-Bench Pro** | 更复杂、更多样且强调降低污染风险的真实软件工程任务 | P1 |
| **SWE-bench Multilingual** | 多语言仓库级 issue resolution | P0 |
| **Multi-SWE-bench** | 覆盖 Java、JavaScript、TypeScript、Go、Rust、C/C++ 等生态 | P0 |
| **SWE-PolyBench** | Java、JavaScript、TypeScript、Python；覆盖 bug、feature 和 refactor，共 2,110 个实例 | P1 |
| **SWE-bench-Live** | 持续从活跃仓库更新任务，强调新鲜度和抗污染 | P1 |
| **SWE-Bench++** | 规模化构造和验证 repository-level 软件工程任务 | P2 |
| **SWE-Bench ProMax** | Python、Java、TypeScript、Go、C、C++、Rust 的大型跨文件重构 | P2 |
| **GitTaskBench** | 54 个真实工作流任务，要求 Agent 利用仓库代码完成复杂目标 | P1 |
| **MobileDev-Bench** | Android Native、React Native 和 Flutter 项目的真实 issue resolution | P2 |

SWE-bench 测的是完整 Agent，而不只是底层模型：Agent 需要搜索仓库、理解 issue、修改文件并通过执行式测试。SWE-bench Verified 适合作为可比性基线，但任务以 Python 为主，因此 KQode 还需要多语言补充。 [\[1\]][ref-1]

SWE-PolyBench 和 SWE-bench-Live 分别补充多语言任务与数据新鲜度；ProMax 进一步覆盖包括 Rust 在内的大规模跨文件重构。 [\[3\]][ref-3] [\[4\]][ref-4] [\[12\]][ref-12]

### Terminal 与端到端开发环境

| Benchmark | 测试内容 | KQode 优先级 |
|---|---|---:|
| **Terminal-Bench** | 在隔离终端中编译、调试、安装、配置、运行测试和处理文件 | P0 |
| **Terminal-Bench 2.0** | 89 个来自真实工作流的困难长程终端任务 | P0 |
| **Terminal-Bench-LILT** | 10 种自然语言、300 个 terminal coding 任务 | P2 |
| **InterCode** | 以代码或命令为 action、执行结果为 observation 的交互式环境 | P1 |
| **AgentBench OS/DB tasks** | Shell、操作系统和数据库交互任务 | P2 |
| **MLE-bench** | 在 Kaggle 竞赛环境中完成数据处理、训练和提交 | P2 |
| **PaperBench** | 阅读论文、实现代码、配置环境并复现实验结果 | P2 |

Terminal-Bench 比单纯 patch benchmark 更能覆盖 KQode 的完整运行时：工作目录、shell、超时、环境变量、依赖安装、失败恢复、输出限制和多步骤执行。 [\[6\]][ref-6]

### 功能开发、重构与真实工作

| Benchmark | 测试内容 | KQode 优先级 |
|---|---|---:|
| **SWE-Lancer** | 1,400 多个真实自由职业软件任务，包括 bug、功能开发和工程方案选择 | P1 |
| **SWE-Refactor** | repository-level 真实重构，要求保持外部行为 | P1 |
| **SWE Refactor Bench** | 整仓迁移和技术债清理，同时检查迁移完整性与行为正确性 | P2 |
| **FeatureBench** | 在现有仓库中实现完整新功能 | P1 |
| **RefactorBench** | 行为保持型重构 | P1 |
| **Commit0** | 从近乎空白或不完整的代码库恢复完整项目 | P2 |
| **TheAgentCompany** | 模拟数字员工，组合编码、终端、网页和工作沟通 | P2 |
| **Alipay-PIBench** | 支付集成中的 SDK、签名、回调和业务状态一致性 | P3 |
| **Rakuten-SWE-Bench** | 企业生产代码库中的真实软件工程任务 | P3 |

SWE-Lancer 的价值在于任务来自真实付费软件工作，而不是只从已合并的 bug-fix commit 反推问题。它可以补充 SWE-bench 对新功能、产品需求和工程决策覆盖不足的问题。 [\[5\]][ref-5]

SWE-Refactor 类 benchmark 适合检测“只让测试变绿”的捷径：评测不仅应验证行为，还应验证目标迁移或重构是否真正完成。 [\[11\]][ref-11]

### 更偏底层模型的代码 Benchmark

| Benchmark | 主要能力 | 是否足以单独评价 Coding Agent |
|---|---|---:|
| **Aider Polyglot** | C++、Go、Java、JavaScript、Python、Rust 的代码编辑 | 否 |
| **LiveCodeBench** | 持续更新的算法代码生成 | 否 |
| **HumanEval / HumanEval+** | 小函数生成 | 否 |
| **MBPP / MBPP+** | 小型 Python 编程题 | 否 |
| **MultiPL-E** | 多语言代码生成 | 否 |
| **BigCodeBench** | 使用库和 API 完成代码任务 | 否 |
| **RepoBench** | 仓库级检索和代码补全 | 部分 |
| **CrossCodeEval** | 跨文件代码补全 | 否 |
| **CRUXEval** | 代码执行结果推理 | 否 |
| **OJBench** | 在线判题和复杂算法题 | 否 |

Aider Polyglot 很适合隔离评估底层模型的编辑能力，但它无法完整测试仓库探索、测试选择、失败恢复、权限审批和任务结束判断。 [\[7\]][ref-7]

---

## 其他 Agent Benchmark 索引

这些 benchmark 不直接以软件工程为核心，但可用于 KQode 后续扩展浏览器、MCP、research agent、computer use 或安全能力。

| 方向 | Benchmark |
|---|---|
| 通用 Agent | GAIA、AgentBench、AgentBoard、AgentQuest、AppWorld、TravelPlanner、AssistantBench、TheAgentCompany、GDPval |
| Web Agent | WebArena、VisualWebArena、WebVoyager、WorkArena、BrowserGym、WebLINX、Mind2Web、WebChoreArena |
| Deep Research | BrowseComp、BrowseComp-Plus、BrowseComp-ZH、AssistantBench、Deep Research Bench、DeepResearchBench、DR.Bench、DatasetResearch、SearchArena、HLE with tools |
| Desktop/GUI | OSWorld、OSWorld-Verified、WindowsAgentArena、WindowsWorld、AndroidWorld、AndroidControl、Mobile-Bench、MobileAgentBench、SCUBA |
| Function Calling | BFCL、API-Bank、API-Bench、ToolBench、StableToolBench、ToolBench Decathlon、ACEBench |
| Stateful Tool Agent | tau-bench、tau2-bench、ToolSandbox、AppWorld、GTA、ToolHop、WildToolBench |
| MCP Agent | MCP-Bench、MCPAgentBench、MCPToolBench++ |
| 科研与数据 | PaperBench、MLE-bench、MLAgentBench、RE-Bench、MLR-Bench、ScienceAgentBench、DiscoveryBench、DSBench、AstaBench、BioMysteryBench |
| 安全 | AgentDojo、InjecAgent、AgentHarm、ST-WebAgentBench、PiBench、SHADE-Arena、ToolEmu、R-Judge、Agent Security Bench |
| Cyber Agent | Cybench、SCONE-bench、ExploitBench、ExploitGym、CyberSecEval Agent tasks |
| 规划与记忆 | PlanBench、TravelPlanner、ALFWorld、ScienceWorld、WebShop、LoCoMo、LongMemEval、METR Task Suite |
| 企业工作流 | CRMArena、CRMArena-Pro、WorkArena、SCUBA、TheAgentCompany、GDPval、SpreadsheetBench |

WebArena 测试可复现网站中的端到端操作，OSWorld 测试真实桌面环境，BrowseComp 测试在开放 Web 上持续寻找难以定位的信息；三者分别对应 browser action、computer use 和 agentic search，不应混为一个指标。 [\[17\]][ref-17] [\[18\]][ref-18] [\[19\]][ref-19]

BFCL 主要测 function-call 选择和参数正确性；tau-bench、ToolSandbox 与 AppWorld 更接近完整工具 Agent，因为它们包含多轮交互、状态变化、业务规则或跨应用任务。 [\[20\]][ref-20] [\[21\]][ref-21] [\[22\]][ref-22]

PaperBench 和 MLE-bench 都需要大量编码与终端操作，但目标分别是论文复现和机器学习竞赛，因此更适合作为专业 Research/Coding Agent 的后期评测，而不是 KQode 第一阶段的主回归套件。 [\[23\]][ref-23] [\[24\]][ref-24]

---

## KQode Evaluation 建议

### 按当前实现阶段的引入顺序

KQode 当前仍处于 Rust-side tool registry 和 provider/conversation 基础能力建设阶段，因此公开 benchmark 应按能力就绪顺序接入，而不是立即追求完整排行榜成绩：

| 顺序 | Benchmark | 何时接入 | 目的 |
|---|---|---|---|
| 1 | KQode 自有 Golden Tasks | 现在开始 | 建立项目行为、轨迹和回归基线 |
| 2 | Terminal-Bench 2.0 子集 | `run_command`、sandbox、timeout 和多轮 loop 可执行后 | 验证真实终端自治 |
| 3 | SWE-bench Verified 子集 | read/search/edit/apply/test 闭环完成后 | 与主流 Coding Agent 横向比较 |
| 4 | Multi-SWE-bench 子集 | 多语言仓库支持稳定后 | 覆盖 Rust、TypeScript、Go 等非 Python 场景 |
| 5 | Aider Polyglot | 需要诊断模型编辑能力时 | 区分模型能力和 Agent scaffold 问题 |
| 6 | SWE-bench-Live | 基础公开评测稳定后 | 降低训练污染和题目记忆 |
| 7 | SWE-Bench Pro、FeatureBench、SWE-Refactor | 长程功能开发与重构能力成熟后 | 验证复杂真实工程工作 |

暂不优先投入 OSWorld、WebArena、BrowseComp、PaperBench 或 MLE-bench。这些评测分别依赖通用 GUI 操作、浏览器、深度研究或专业机器学习环境，不符合 KQode 当前“先完成桌面 Coding Agent 应用及其可复用 Rust 运行时”的里程碑顺序。

### 第一阶段：确定性 Harness

1. 建立 20-50 个仓库内 golden tasks，固定 base commit、任务描述、允许修改范围和验证命令。
2. 任务至少覆盖 bug fix、添加测试、跨文件修改、重构、配置修改、文档同步和无法完成时的明确报告。
3. 每个任务保存模型版本、system prompt 版本、tool registry 版本、token/cost、工具轨迹、最终 diff 和测试结果。
4. 判分分离 `task success`、`patch quality`、`policy compliance`、`cost`、`latency` 和 `reproducibility`。

### 第二阶段：公开基准

| 能力 | 推荐 benchmark | 原因 |
|---|---|---|
| 真实 issue 修复 | SWE-bench Verified 子集 | 生态成熟，方便与公开 Agent 对比 |
| CLI 与终端工具执行 | Terminal-Bench 2.0 子集 | 验证 Coding Agent 通过 CLI/headless 模式调用终端工具的能力，不代表产品提供 TUI |
| Rust/TypeScript/多语言 | Multi-SWE-bench 或 SWE-Bench ProMax 子集 | 避免只优化 Python |
| 编辑模型诊断 | Aider Polyglot | 区分模型编辑能力与 Agent scaffold 问题 |
| 新功能和重构 | FeatureBench + SWE-Refactor | 补足 SWE-bench 偏 bug-fix 的限制 |
| 新鲜任务 | SWE-bench-Live | 减少训练污染和记忆答案 |
| 真实价值 | SWE-Lancer | 检验复杂产品和商业软件任务 |

### 推荐的最小公开套件

```text
SWE-bench Verified
+ Terminal-Bench 2.0
+ Multi-SWE-bench
+ Aider Polyglot
```

这个组合分别测量仓库级修复、终端自治、多语言软件工程和底层编辑能力。KQode 自有 golden tasks 应作为持续 CI 回归主线，公开 benchmark 用于阶段性横向比较，不应反过来驱动产品只适配某个榜单。

Golden set 的详细设计保存在 [`evaluation/golden`](../../evaluation/golden/README.md)。第一版包含 25 个 Harbor-native 任务：19 个 `run_command` 只读能力任务、3 个 `fetch_web_url` 任务和 3 个 `ask_user` 任务。

### 结果记录要求

- 固定 benchmark release、dataset revision 和容器镜像。
- 记录模型的完整版本，而不是只写产品家族名。
- 记录 agent scaffold、system prompt、工具列表、上下文窗口和最大步数。
- 记录 token、成本、wall-clock time、重试次数和并发度。
- 至少运行多次并报告均值、方差或置信区间。
- 保存每次 trajectory、patch、测试日志和失败分类。
- 防止超出 workspace、修改测试或读取答案等 benchmark contamination。
- 不直接比较执行环境、预算或 scaffold 不同的 leaderboard 分数；基础设施差异本身可能超过模型之间的小幅分差。 [\[14\]][ref-14]

---

## Risks and Tradeoffs

- **Benchmark overfitting:** SWE-bench 公开时间长，模型或 scaffold 可能针对题型过度优化。
- **Contamination:** 训练数据可能包含 issue、PR、gold patch 或测试代码；优先加入 live/holdout 任务。
- **Verifier weakness:** 测试通过不一定代表需求完整实现，尤其是重构、性能、安全和 UX 任务。
- **Infrastructure noise:** CPU、网络、镜像、依赖缓存和并发配置都会影响结果。
- **Scaffold dependence:** 相同模型搭配不同 prompt、工具、上下文策略和重试策略，成绩可能显著不同。
- **Cost blindness:** 只看 resolved rate 会鼓励无限 token、无限尝试和昂贵模型。
- **Language imbalance:** SWE-bench Verified 主要是 Python，不能代表 Rust-first 的 KQode。
- **Safety blind spot:** 完成任务不代表操作安全；还需单独评价权限、路径边界、提示注入和危险命令审批。

---

## References

Body citations use these numbered source references.

- <a id="ref-1"></a>[1] OpenAI: SWE-bench Verified 的任务定义、人工复核和局限说明 ([source](https://openai.com/index/introducing-swe-bench-verified/)).
- <a id="ref-2"></a>[2] Scale AI: SWE-Bench Pro 官方说明与 leaderboard ([source](https://labs.scale.com/leaderboard/swe_bench_pro_public)).
- <a id="ref-3"></a>[3] SWE-PolyBench: 多语言 repository-level coding-agent benchmark ([paper](https://arxiv.org/abs/2504.08703)).
- <a id="ref-4"></a>[4] SWE-bench-Live: 持续更新和抗污染的软件工程 benchmark ([paper](https://arxiv.org/abs/2505.23419)).
- <a id="ref-5"></a>[5] SWE-Lancer: 来自真实自由职业软件工程工作的 benchmark ([paper](https://arxiv.org/abs/2502.12115)).
- <a id="ref-6"></a>[6] Terminal-Bench 2.0: 真实、困难的 command-line Agent 任务 ([paper](https://arxiv.org/abs/2601.11868)).
- <a id="ref-7"></a>[7] Aider: Polyglot coding benchmark 和 leaderboard 方法 ([source](https://aider.chat/docs/leaderboards/)).
- <a id="ref-8"></a>[8] InterCode: 交互式编码环境和执行反馈 benchmark ([paper](https://arxiv.org/abs/2306.14898)).
- <a id="ref-9"></a>[9] GitTaskBench: 利用真实代码仓库完成复杂工作流任务 ([paper](https://arxiv.org/abs/2508.18993)).
- <a id="ref-10"></a>[10] MobileDev-Bench: 移动应用真实 issue resolution ([paper](https://arxiv.org/abs/2603.24946)).
- <a id="ref-11"></a>[11] SWE-Refactor: repository-level 行为保持型重构评测 ([paper](https://arxiv.org/abs/2602.03712)).
- <a id="ref-12"></a>[12] SWE-Bench ProMax: 大型、多语言、跨文件代码重构 ([paper](https://arxiv.org/abs/2608.09802)).
- <a id="ref-13"></a>[13] OpenAI GPT-5 system card: SWE-bench、MLE-bench、SWE-Lancer 和 PaperBench 等评测 ([source](https://deploymentsafety.openai.com/gpt-5/swe-bench-verified-n477)).
- <a id="ref-14"></a>[14] Anthropic: SWE-bench/Terminal-Bench 的 Agent 评测与基础设施噪声分析 ([source](https://www.anthropic.com/engineering/infrastructure-noise)).
- <a id="ref-15"></a>[15] Moonshot AI: Kimi K2 agentic intelligence 与公开评测资料 ([source](https://github.com/MoonshotAI/Kimi-K2)).
- <a id="ref-16"></a>[16] DeepSeek-V3.2: Search、Code、Code Interpreter 和 General Agent 评测 ([paper](https://arxiv.org/abs/2512.02556)).
- <a id="ref-17"></a>[17] OSWorld: 真实计算机环境中的多模态 Agent benchmark ([paper](https://arxiv.org/abs/2404.07972)).
- <a id="ref-18"></a>[18] WebArena: 可复现网站环境中的自主 Web Agent benchmark ([paper](https://arxiv.org/abs/2307.13854)).
- <a id="ref-19"></a>[19] OpenAI BrowseComp: 难检索开放 Web 信息的 browsing-agent benchmark ([source](https://openai.com/index/browsecomp/)).
- <a id="ref-20"></a>[20] Berkeley Function Calling Leaderboard: function calling 评测 ([source](https://gorilla.cs.berkeley.edu/leaderboard.html)).
- <a id="ref-21"></a>[21] tau-bench: 对话、工具和业务规则约束下的 Agent benchmark ([paper](https://arxiv.org/abs/2406.12045)).
- <a id="ref-22"></a>[22] AppWorld: 跨应用、可执行 API 环境中的 Agent benchmark ([paper](https://arxiv.org/abs/2407.18901)).
- <a id="ref-23"></a>[23] OpenAI PaperBench: AI 复现机器学习论文的 benchmark ([source](https://openai.com/index/paperbench/)).
- <a id="ref-24"></a>[24] MLE-bench: Kaggle 机器学习工程 Agent benchmark ([paper](https://arxiv.org/abs/2410.07095)).
- <a id="ref-25"></a>[25] AgentDojo: tool-using Agent 的提示注入攻防 benchmark ([paper](https://arxiv.org/abs/2406.13352)).
- <a id="ref-26"></a>[26] METR: 用人类任务时长衡量 Agent autonomous task horizon ([paper](https://arxiv.org/abs/2503.14499)).

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
