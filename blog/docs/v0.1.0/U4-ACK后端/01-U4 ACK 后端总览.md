---
sidebar_position: 1
title: 1. U4 ACK 后端总览
---

U4 对应 tag [`U4`](https://github.com/kefeiqian/KQode/commit/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e)，提交是 [`f86f87f31e74ef3f27cd7ff22b70665e02b66b2e`](https://github.com/kefeiqian/KQode/commit/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e)，主题是 `feat(backend): add JSON-RPC ACK backend`。它的父提交是 U1 的 [`99949b9fe7698a1f0b87acda232281cbaeb4d81d`](https://github.com/kefeiqian/KQode/commit/99949b9fe7698a1f0b87acda232281cbaeb4d81d)，所以这篇只记录从 U1 到 U4 这一个 commit 自己引入的内容。

这里有一个容易让读者困惑的时间线：tag 名叫 U4，但它在提交历史上早于 U2 和 U3 的首页工作。也就是说，KQode 先把 Rust 后端的最小 JSON-RPC 通路打通，再继续做后面的 TUI 首页视觉与交互。编号来自计划单元，不等于所有 commit 的落地顺序。

U4 映射计划文档里的 [`U4. Add the Rust JSON-RPC stdio backend mode`](https://github.com/kefeiqian/KQode/blob/17b51456a479ab5de20af403bf1668788099d076/docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md#u4-add-the-rust-json-rpc-stdio-backend-mode)：目标是新增一个隐藏的 Rust backend mode，通过 stdio 跑 JSON-RPC 循环，接收 `kqode.message.submit` 请求，并返回确定性的 ACK 结果。这个单元故意不做 agent 推理、不做模型调用，也不接入真实 TUI 状态；它证明的是“前端进程可以用协议驱动 Rust 后端进程”这条最短路径。

## 这个 milestone 交付了什么

U4 把原来的 Hello World Rust binary 改成了一个有两种行为的 CLI：默认运行仍然无害，只打印 starter 提示；传入隐藏参数 `--__kqode-json-rpc-backend` 时，进程进入内部 JSON-RPC backend 模式。提交同时新增了 library 入口，让测试和 binary 都能复用同一套协议常量与 backend 逻辑。

核心数据流如下：

```text
TUI 或测试进程
  -> 启动 kqode --__kqode-json-rpc-backend
  -> stdin 写入 Content-Length framed JSON-RPC request
  -> Rust backend stdio loop 读取 Message::Request
  -> handle_request 校验 method 和 params
  -> 返回 MessageSubmitResult
  -> stdout 写出 Content-Length framed JSON-RPC response
```

这条链路看起来很小，但它是后续所有“终端 UI 调用 Rust core”的基础。如果没有这一步，前端只能自己假装有 backend；有了这一步，后面的 U5、U6、U7、U8 才能分别把 TypeScript 协议、进程启动、客户端连接和 UI 状态接上来。

![U4 ACK 后端请求响应链路](../../images/u4-ack-backend/ack-round-trip.png)

## 文件地图 / 篇目

| 篇目 | 模块 | 本 milestone 中的作用 |
| --- | --- | --- |
| 01 | 总览 | 解释 U4 的交付范围、时间线、计划映射和数据流。 |
| 02 | Rust 后端入口与隐藏模式 | 讲 [`Cargo.toml`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/Cargo.toml)、[`main.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/main.rs) 如何把普通 CLI 和 hidden backend mode 分开。 |
| 03 | JSON-RPC stdio 读写循环 | 讲 [`src/backend.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/src/backend.rs) 如何使用 `lsp-server` 的 stdio transport。 |
| 04 | ACK 请求协议与类型 | 讲 [`src/protocol.rs`](https://github.com/kefeiqian/KQode/blob/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/src/protocol.rs) 里的 method、error code、params 和 result。 |
| 05 | CLI 与 ACK 成功路径测试 | 讲 [`tests/`](https://github.com/kefeiqian/KQode/tree/f86f87f31e74ef3f27cd7ff22b70665e02b66b2e/tests) 如何覆盖 CLI 默认行为与成功的 ACK 往返。 |
| 06 | JSON-RPC 错误与 transport 测试 | 讲非法参数、未知方法、malformed transport 等错误场景的测试覆盖。 |
| 07 | U4 总结 | 总结已交付内容、关键技术决策和刻意延后内容。 |
