---
sidebar_position: 3
title: 3. 创建前端TUI项目
---

在后端Rust项目建好之后，我们接下来创建前端的项目。目前大部分的Coding Agent的形式都是命令行CLI，市面上最著名的命令行TUI(Terminal UI)方案就是Ink。

## Ink 介绍

<p align="center">
  <img src="https://raw.githubusercontent.com/vadimdemedes/ink/master/media/logo.png" alt="Ink logo" width="180" />
</p>

[Ink](https://github.com/vadimdemedes/ink) 是一个用 React 写命令行界面的框架。它把终端里的输入框、列表、状态栏、流式输出等都抽象成组件，让我们可以用熟悉的 React state 和 hooks 组织 TUI，而不是手动拼接 ANSI 字符串。

很多 Coding Agent 都选择了类似的路线，例如 Claude Code、OpenAI Codex CLI、Google Gemini CLI 等。它们都需要在终端里展示对话、工具调用、diff、审批和执行进度，Ink 很适合快速搭建这种交互密集的 CLI 界面。

在 KQode 里，Ink 只负责前端 TUI。真正的 Agent Loop、工具执行、会话记录和策略控制仍然放在 Rust 核心里，这样以后也可以替换成其他 UI。


Claude Code 界面截图：

![Claude Code 界面示意图](./images/create-frontend-tui-project/claude-code-tui-example.png)

## 创建Ink项目