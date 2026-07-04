---
sidebar_position: 6
title: 6. citty CLI 元信息
---

[`015987d2`](https://github.com/kefeiqian/KQode/commit/015987d2) 给 packaged `kqode` 增加了 `--help` 和 `--version`。这个改动看起来只是 CLI 体验补齐，但它澄清了一个重要边界：npm 的 `kqode` executable 是 packaged Bun / Ink TUI，不是 Rust binary；所以 `--version` 也必须在 TUI entry 里处理。

![citty 在启动 Ink TUI 前处理 help 和 version](../images/v0-1-3-citty-cli/citty-before-tui-launch.png)

## 为什么不是 Rust binary 处理 --version

KQode 的长期方向是 Rust core + TypeScript Ink TUI，但当前 npm 分发的可执行文件来自 TUI packaging：`packaging/npm/kqode/bin/kqode.cjs` 找到平台包里的 packaged executable，然后把 argv 原样转交过去。用户运行：

```bash
kqode --version
```

实际进入的是 [`tui/packaged/entry.packaged.tsx`](https://github.com/kefeiqian/KQode/blob/015987d2/tui/packaged/entry.packaged.tsx)，不是 `src/main.rs`。如果把 version flag 放在 Rust 入口，npm 用户不会经过那段逻辑。v0.1.3 因此把 CLI meta flag 处理放在 TUI entry 层。

## package.json：引入 citty

[`tui/package.json`](https://github.com/kefeiqian/KQode/blob/015987d2/tui/package.json) 新增依赖：

```json
"dependencies": {
  "citty": "^0.2.2",
  "ink": "^7.1.0",
  "jotai": "^2.20.1",
  "react": "^19.2.7",
  "tree-kill": "^1.2.2",
  "vscode-jsonrpc": "^9.0.0"
}
```

为什么用 `citty`，而不是手写 `process.argv.includes('--version')`？因为 `--help`、`-h`、`--version`、`-v` 这类基础行为虽然小，但手写后容易散落在 source entry 和 packaged entry 两处。`citty` 用 command metadata 统一生成 help / version 行为，后续如果要加 subcommand 或 global flag，也不需要推翻现有入口。

## kqodeCli.tsx：没有参数时启动 TUI，有 meta flag 时直接回答

[`tui/src/cli/kqodeCli.tsx`](https://github.com/kefeiqian/KQode/blob/015987d2/tui/src/cli/kqodeCli.tsx) 把 TUI 启动封装成 root command：

```tsx
export function createKqodeCommand(options: RunKqodeCliOptions) {
  return defineCommand({
    meta: buildKqodeMeta({ entryUrl: options.entryUrl }),
    run: () => launchTui(options)
  });
}

/** Parses argv, answers `--help` / `--version`, or launches the TUI. */
export function runKqodeCli(options: RunKqodeCliOptions): Promise<void> {
  return runMain(createKqodeCommand(options));
}
```

这段代码的关键是 `run` 仍然只做一件事：启动 Ink TUI。`citty` 负责在 `run` 之前处理内建 meta flags。这样不会出现 `--version` 先把 TUI runtime 初始化了一半、再提前退出的问题；对于 CLI meta query，程序应该快速输出、快速退出。

## meta.ts：source mode 和 packaged mode 的版本来源不同

[`tui/src/cli/meta.ts`](https://github.com/kefeiqian/KQode/blob/015987d2/tui/src/cli/meta.ts) 里，版本解析仍然区分 source 和 packaged：

```ts
export function buildKqodeMeta({ entryUrl }: { entryUrl: string }): KqodeMeta {
  const version = __PROD__
    ? resolveProductVersion({})
    : resolveProductVersion({ repoRoot: resolveRepoRoot(path.dirname(fileURLToPath(entryUrl))) });

  return { name: CLI_NAME, version, description: CLI_DESCRIPTION };
}
```

这个 WHY 很容易被忽略：开发模式下，TUI 从源码运行，需要根据 `entryUrl` 找 repo root，再读 Cargo manifest；packaged mode 下，binary 已经在 build 阶段注入版本。把两种路径包在 `buildKqodeMeta` 里，可以确保 `createAppRuntime` 和 CLI meta 使用同一套 version resolution，而不是让 `--version` 和界面显示的版本各算各的。

## packaged entry：npm executable 的真实入口

[`tui/packaged/entry.packaged.tsx`](https://github.com/kefeiqian/KQode/blob/015987d2/tui/packaged/entry.packaged.tsx) 变得非常薄：

```tsx
import { runKqodeCli } from '@/cli/kqodeCli.tsx';
import { loadEmbeddedBackendAsset } from './embeddedBackendAsset.ts';

// Packaged (`bun build --compile`) entrypoint. Mirrors `main.tsx` but injects
// the embedded backend asset so the Bun-only embedding stays out of the source
// graph. `--define KQODE_ENV="prod"` selects the packaged branch.
await runKqodeCli({ entryUrl: import.meta.url, loadPackagedAsset: loadEmbeddedBackendAsset });
```

这段代码说明 v0.1.3 没有把 `--version` 做成 npm launcher 的 special case。launcher 仍然只转发 argv；packaged entry 统一处理 CLI 元信息和 TUI 启动。这保持了“npm 安装路径”和“直接 Release binary 路径”的行为一致。

## 取舍：现在只做 root command

这次没有扩展复杂 subcommand。原因是 v0.1.3 的目标是发布工程闭环，不是 CLI 产品面大扩张。先把 `--help` / `--version` 做正确，后续再加 `kqode doctor`、`kqode session` 或 headless flags 时，已经有 `citty` command 结构可以承载。
