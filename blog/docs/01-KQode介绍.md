---
id: index
slug: /
sidebar_position: 1
title: KQode 介绍
---

# KQode

KQode 是一个基于 Rust 的 Coding Agent，作为学习及研究 Agent Runtime 以及 Harness 使用。

## 笔者序
最近所有文章、新闻、视频都在说 Agent Harness, 为了学习并研究最新的 Agent Runtime 还有 Harness Engineering 的技术，没有什么是比做一个类似 Copilot CLI/Claude Code 的 Coding Agent 更好的方式了。另外正好可以借此机会使用一下不熟悉的 Rust，一鱼两吃。

我们的目标是构建一个可以用于日常工作的生产级 Coding Agent，对标 Codex/Claude Code/Copilot CLI。

很多技术教程的书写顺序是先把产品做完，然后从头开始把所有的工作梳理一遍，再开始写教程，对整个产品的整体架构以及各个实现细节加以介绍。这样做非常专业。唯一美中不足的是对于刚接触这个领域的新手来说，很多事情不是显然的，很多工具、概念甚至名词缩写都没听过，加上没有背景知识，导致看的时候一头雾水。笔者在写作过程中会尽力兼顾刚进入这个领域的各级别的读者，但因水平有限，写作过程难免有所疏漏，请各位专家、同行拨冗予以批评指正，笔者感激不尽。


## 参考的 Coding Agent 列表

本项目参考了目前各大开源/闭源的 Coding Agent，包括但不限于 Copilot CLI、Claude Code、Codex、Gemini CLI、OpenCode、Kimi Code 等，在此向贡献这些项目的工程师们致以敬意与感谢。

| 名称 | 主页 | GitHub |
|---|---|---|
| GitHub Copilot CLI | [GitHub Copilot CLI](https://github.com/features/copilot/cli/) | [github/copilot-cli](https://github.com/github/copilot-cli) |
| GitHub Copilot SDK | [GitHub Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk) | [github/copilot-sdk](https://github.com/github/copilot-sdk) |
| Claude Code | [Claude Code](https://claude.com/product/claude-code) | - |
| Claude Agent SDK | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) | [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) · [anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) |
| OpenAI Codex CLI | [Codex](https://openai.com/codex/) | [openai/codex](https://github.com/openai/codex) |
| Gemini CLI | [Gemini CLI](https://geminicli.com) | [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| OpenCode | [OpenCode](https://opencode.ai) | [anomalyco/opencode](https://github.com/anomalyco/opencode) |
| Kimi Code CLI | [Kimi Code](https://moonshotai.github.io/kimi-code/) | [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) |
| KimiX | - | [Sikao-Engine/KimiX](https://github.com/Sikao-Engine/KimiX) |
| SWE-agent | [SWE-agent](https://swe-agent.com) | [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent) |