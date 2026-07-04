---
sidebar_position: 1
title: 1. 后端进程 launcher 总览
---

U6 对应 tag [`U6`](https://github.com/kefeiqian/KQode/commit/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd)，提交是 [`29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd`](https://github.com/kefeiqian/KQode/commit/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd)，主题是 `feat(tui): add the guarded source backend process launcher`。这一篇只记录这个 tag 自己引入的差异：`tui/src/backend/process/` 下新增的 source-mode 后端进程启动器，以及围绕它的单元测试和集成测试。

计划文档里对应的是 [`U6. Implement the guarded source backend process launcher`](https://github.com/kefeiqian/KQode/blob/17b51456a479ab5de20af403bf1668788099d076/docs/plans/2026-06-25-003-feat-first-ink-tui-homepage-plan.md#u6-implement-the-guarded-source-backend-process-launcher)：目标是把“从 TypeScript TUI 启动 Rust 后端”这一步做成受控路径，而不是让 UI 组件直接 `spawn` 一个随缘进程。

![U6 后端进程 launcher 启动链路示意图](../../images/u6-backend-launcher/source-backend-launch-flow.png)

## 这一版交付了什么

U6 新增 7 个文件：

| 文件 | 作用 |
| --- | --- |
| [`backendBuild.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/backendBuild.ts) | 从可信 `repoRoot` 执行 `cargo build --bin kqode`，并解析 debug 后端二进制路径。 |
| [`backendProcess.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/backendProcess.ts) | 启动已经构建好的 Rust 后端，把 `stdin` / `stdout` / `stderr` 暴露给后续 JSON-RPC client。 |
| [`processEnv.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/processEnv.ts) | 构造严格 allowlist 环境，默认不继承 secret 和无关变量。 |
| [`processUtils.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/processUtils.ts) | 封装 process-tree 清理和有上限的 stderr buffer。 |
| [`backendBuild.test.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/__tests__/backendBuild.test.ts) | 覆盖路径解析、构建失败、构建超时和命令启动失败。 |
| [`backendProcess.test.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/__tests__/backendProcess.test.ts) | 覆盖缺失二进制错误，以及真实 Rust 后端的 source-mode 启动。 |
| [`processEnv.test.ts`](https://github.com/kefeiqian/KQode/blob/29eaf0a236e7ec16f2fc39f9aeea709f74e1f0dd/tui/src/backend/process/__tests__/processEnv.test.ts) | 覆盖 Unix / Windows 环境变量 allowlist 和 Cargo 变量开关。 |

核心组合函数很短：先 build，再 spawn。

```ts
export async function launchSourceBackend({
  repoRoot,
  workspaceCwd,
  buildTimeoutMs
}: LaunchSourceBackendOptions): Promise<LaunchedBackend> {
  await buildBackend({ repoRoot, timeoutMs: buildTimeoutMs });
  return await spawnBackend({
    binaryPath: resolveBackendBinaryPath(repoRoot),
    workspaceCwd
  });
}
```

## 数据流

```text
TUI composition root
  -> launchSourceBackend({ repoRoot, workspaceCwd })
  -> buildBackend(repoRoot, hardened env with Cargo variables)
  -> resolve target/debug/kqode(.exe)
  -> spawnBackend(binaryPath, workspaceCwd, hardened env without Cargo variables)
  -> LaunchedBackend { stdin, stdout, stderr, onExit, dispose }
  -> U7 JSON-RPC client
```

这里最重要的不是“能启动一个进程”，而是把启动语义固定下来：构建发生在可信 `repoRoot`，运行发生在用户的 `workspaceCwd`，环境变量被收敛，进程生命周期由 `LaunchedBackend` 统一托管。

## 篇目地图

| 篇目 | 主题 |
| --- | --- |
| 01. 后端进程 launcher 总览 | 交付范围、计划映射和数据流。 |
| 02. 解析后端构建与启动路径 | 为什么先从源码 build，再解析平台相关二进制路径。 |
| 03. 环境收敛与进程守卫 | 为什么要环境 allowlist、stderr 上限和 process-tree kill。 |
| 04. 生命周期错误处理与测试 | 启动失败、超时、workspace cwd 和集成测试。 |
| 05. U6 总结 | 关键决策、原因和递延事项。 |
