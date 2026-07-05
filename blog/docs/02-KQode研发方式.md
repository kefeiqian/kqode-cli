---
sidebar_position: 2
title: KQode 研发方式
---

上一篇我们介绍了 KQode 的目标。正式进入代码实现之前，需要先说明一下这个项目的研发方式：KQode 不是一次性把完整架构设计好再实现，而是用“可运行的小步迭代”逐步把 Coding Agent Harness 搭起来。

这篇文章放在具体实现之前，是因为接下来每一步都会同时涉及产品判断、架构边界、代码实现和验证方式。如果没有先约定研发节奏，同时我们又重度使用 Coding Agent 进行实现，很容易把项目做成一堆功能拼装，而不是一个可以长期演进的 Agent Runtime。

## 为什么先写研发方式

Coding Agent 不是普通 CLI 工具。它既要和模型交互，也要执行本地命令、修改文件、展示 diff、保存会话、处理审批和失败恢复。任何一个模块看起来都可以先做，但顺序不对就会产生很多返工。

KQode 的研发会遵循几个原则：

- Rust 核心先行：Agent Loop、工具注册、文件系统修改、命令执行、策略审批和会话记录都放在 Rust 侧。
- TUI 保持可替换：Ink 前端只负责终端交互，不拥有核心状态机。
- 每次只做一个可验证的小单元：例如先跑通本地命令，再接入工具结果展示，而不是一次性做完整工具系统。
- 参考现有 Agent，但不复制实现：参考 Copilot CLI、Claude Code、Codex CLI、Gemini CLI、OpenCode 等项目的产品行为和架构取舍，但代码实现保持独立。
- 先保证本地可用，再扩展高级能力：先做一个能在本机终端里工作的 Agent，再考虑 MCP、Subagent、IDE 集成、浏览器自动化或云端运行。

## 研发循环

后续每一篇文章基本都会按同一个循环推进：

1. 先明确这一小步要解决的真实问题。
2. 再确定 Rust 核心和 TypeScript TUI 的边界。
3. 实现最小可运行版本。
4. 运行对应的构建、测试或手工验证。
5. 记录这一轮得到的架构结论和下一步。

这个循环的重点是每一步都留下可以运行、可以回滚、可以继续扩展的状态。对于 Agent Harness 来说，很多设计问题只有在真的跑起来之后才会暴露，例如工具输出如何截断、审批如何阻塞、上下文如何引用文件、失败之后如何继续对话等。

## 使用 Compound Engineering 进行设计与实现

KQode 的研发会重度使用 [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)。

在真正写代码之前，我们会先用 `ce-brainstorm` 把模糊想法整理成需求，再用 `ce-plan` 把需求整理成可以执行、可以评审、可以验证的方案。

整个方案由许多细项组成，每一条都会被 review，确认范围、边界、风险和验收方式都没有问题之后，才开始进入实现阶段。比如第一个 Ink TUI 首页功能对应的方案文档是 [`docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md`](https://github.com/kefeiqian/KQode/blob/ad9670d1978ae2c6e738ea76bc52b58149463dbd/docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md)，里面把需求、范围边界、技术约束、上下文研究、测试策略和任务拆分都整理成了可勾选的 item。

这种做法很适合 KQode 这类项目：一方面我们确实在用 Coding Agent 加速开发；另一方面，我们不希望 Agent 直接从一句模糊指令直接跳到代码实现。先 brainstorm、再 plan、逐条 review，能让人类把控产品方向和架构边界，也能让 Agent 在明确上下文里完成更稳定的实现。

方案 review 通过之后，我们会把它继续拆成 U1、U2 这样的 commit-sized 小单元，并通过 `ce-work` 逐个实现。每个小单元实现完成后，都会进入人类 + Agent 的双重 review：Agent 侧使用 `ce-code-review` 做结构化检查，发现问题后先修复并再次验证；最后再由人类，也就是笔者本人，进行最终 review。只有确认每个 commit 都经过人类 review 之后，才会真正提交代码，以此保证研发质量，同时保证人类对整体项目的把控。

## 使用的 Coding Agent 和模型

在日常研发中，我们主要使用 [GitHub Copilot CLI](https://github.com/features/copilot/cli/) 作为 Coding Agent 的交互入口。

模型方面，主要使用 GPT-5.5 和 Claude Opus 4.8。前者适合多数代码实现、重构和验证任务；后者适合复杂架构推理、长上下文审阅和高风险方案判断。KQode 本身也会参考这种“工具入口 + 多模型能力 + 明确方案约束”的工作方式，逐步沉淀出自己的 Agent Runtime。

## 文档和代码一起演进

这个系列文章不是项目完成后的总览教程，而是随着 KQode 不断迭代同步写作，因此文章里会保留一些阶段性的判断：有些方案后面可能会调整，有些模块会从简单实现逐步拆分成独立 crate。

这样写的好处是读者可以看到一个 Coding Agent 从零开始长出来的过程，而不是只看到最后整理好的结果。对于学习 Agent Runtime 和 Harness Engineering 来说，过程中的取舍往往比最终代码更重要。

接下来会进入 U1 研发脚手架阶段，先把 Rust 项目、前端 TUI 项目和自动化命令入口搭起来。但无论界面如何变化，核心研发方向都会保持一致：Rust 负责可复用、可验证的运行时能力，TUI 负责把这些能力清晰地呈现给用户。
