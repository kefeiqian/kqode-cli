---
sidebar_position: 2
title: 2. TUI 退出总结卡片
---

`v0.1.1` 的第一项用户可见变化，是 TUI 退出时打印一张 summary card。对应 commit 是 [`cc82123e`](https://github.com/kefeiqian/KQode/commit/cc82123e930df7d7850ba19da82fc13e7b60fae0)，对应计划文档是同一 commit 下的 [`docs/plans/2026-07-01-001-feat-tui-exit-summary-card-plan.md`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/docs/plans/2026-07-01-001-feat-tui-exit-summary-card-plan.md)。

这张卡片解决的是一个很实际的 TUI 体验问题：用户在 alternate screen 里和 KQode 交互，退出之后原 shell scrollback 会恢复。如果退出时什么也不留下，用户会失去“刚刚这次 session 做了什么”的落点；如果把总结渲染在 Ink 界面里，离开 alternate screen 后又会消失。因此这次选择在 TUI teardown 之后，把卡片写回正常 terminal buffer。

![退出后出现在正常 scrollback 的总结卡片](../images/v0-1-1-exit-summary-card/exit-summary-card.png)

## 卡片显示什么

这个版本只接入两类真实数据：

- `Duration`：从 session 启动时间到退出时间的持续时间。
- `Changes`：退出时工作区相对启动基线新增和删除的行数。

`Cost`、`Tokens` 和 `Resume` 暂时没有数据源，所以 formatter 明确选择省略这些行，而不是显示假的占位内容。这个取舍很重要：早期 UI 宁愿少显示，也不要让用户误以为 token、cost 或 resume 已经被可靠追踪。

从 [`tui/src/components/exitSummary/formatExitSummaryCard.ts`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/components/exitSummary/formatExitSummaryCard.ts) 可以看到这一点：

```ts
const INSERTIONS_SIGN = '+';
const DELETIONS_SIGN = '−';
const COLUMN_GAP = '  ';
const ROW_LABELS = ['Changes', 'Duration', 'Cost', 'Tokens', 'Resume'] as const;
const LABEL_WIDTH = Math.max(...ROW_LABELS.map((label) => label.length));
```

以及 `Cost`、`Tokens`、`Resume` 的延期策略：

```ts
  if (label === 'Duration') {
    return data.durationMs === undefined ? undefined : formatDuration(data.durationMs);
  }

  // Cost, Tokens, and Resume have no data source yet — omitted until they do.
  return undefined;
}
```

为什么不先做静态文案？因为 summary card 是退出时的信任界面。它未来会承载成本、token、resume 命令等敏感信息，一旦早期放进“看起来像真实统计”的占位符，用户会很难分辨哪些行可依赖。

## 数据为什么要分成启动基线和退出计算

如果退出时直接运行 `git diff --shortstat HEAD`，卡片会把 session 开始前已经存在的脏改动也算进去。对于 coding agent 来说这很危险：用户可能在启动 KQode 前已经有未提交修改，summary card 却暗示这些都是本次 session 造成的。

所以提交新增了 [`resolveSessionSeed.ts`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/components/exitSummary/resolveSessionSeed.ts)，在启动时记录当前时间和 Git baseline：

```ts
export function resolveSessionSeed({
  cwd,
  now = Date.now,
  readLineDelta = readWorkingTreeLineDelta
}: ResolveSessionSeedDeps): SessionSeed {
  return {
    startedAt: now(),
    baseline: readLineDelta(cwd)
  };
}
```

然后 [`computeExitSummary.ts`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/components/exitSummary/computeExitSummary.ts) 在退出时读取当前 working tree，并减去启动基线：

```ts
function resolveChanges(
  baseline: GitLineDelta | undefined,
  current: GitLineDelta | undefined
): GitLineDelta | undefined {
  if (baseline === undefined || current === undefined) {
    return undefined;
  }

  return {
    insertions: Math.max(0, current.insertions - baseline.insertions),
    deletions: Math.max(0, current.deletions - baseline.deletions)
  };
}
```

这里的 `Math.max(0, ...)` 不是装饰。它处理的是中途 commit、rebase 或外部工具改动带来的负 delta。summary card 的职责是给用户一个保守、不会误导的退出摘要；遇到难以归因的情况时，宁愿夹到 `0` 或省略，也不展示负数这种看起来像 bug 的统计。

## 为什么不是 React / Ink 组件

这个目录放在 `components` 下，但 README 明确说它不是 React / Ink component。[`tui/src/components/exitSummary/README.md`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/components/exitSummary/README.md) 的说明很直接：

```md
**Not React/Ink components.** This folder is pure logic — it formats the
exit-summary card as a string and prints it to the terminal when the TUI shuts
down. Nothing here renders JSX.
```

为什么还放在 `components`？因为它是 UI concern：用户看到的退出卡片由这里定义。放到 `libs` 会让它看起来像通用终端 helper，但它其实包含产品文案、行选择、色彩和退化策略。

## 渲染和退出顺序

真正写 terminal 的入口是 [`printExitSummary.ts`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/components/exitSummary/printExitSummary.ts)。它只在 TTY 上输出，非 TTY 时直接 no-op：

```ts
export function printExitSummary({
  store,
  stream = process.stdout,
  now = Date.now,
  readLineDelta,
  colorize = ansiColorize
}: PrintExitSummaryDeps): void {
  if (!stream.isTTY) {
    return;
  }
```

这个 no-op 很关键。CI、测试、pipe 和 redirect 场景不应该混入 ANSI 卡片，否则 snapshot、日志和机器读取都会被污染。

退出顺序由 [`finishSession.ts`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/components/exitSummary/finishSession.ts) 固定：

```ts
export function finishSession({ store, dispose }: FinishSessionDeps): void {
  dispose();
  printExitSummary({ store });
}
```

先 `dispose()`，再打印 card，是为了让 terminal 背景、窗口标题和 alternate screen 先恢复。这样 summary card 不会留在 alternate screen，也不会继承 TUI 的背景色。

启动侧的 seed 写入则发生在 [`tui/src/bootstrap.ts`](https://github.com/kefeiqian/KQode/blob/cc82123e930df7d7850ba19da82fc13e7b60fae0/tui/src/bootstrap.ts)：

```ts
  const seed = resolveSessionSeed({ cwd: workspaceCwd });
  store.set(sessionStartedAtAtom, seed.startedAt);
  store.set(sessionGitBaselineAtom, seed.baseline);
```

这就是本次 wiring 的核心：启动时采样，退出时计算，terminal 恢复后打印。

## 为什么先做这个小功能

退出总结卡片看起来小，但它定义了 KQode 后续 session 叙事的出口。coding agent 不只要“做事”，还要在完成、失败或退出时把结果交代清楚。`v0.1.1` 先用 duration 和 line delta 验证这条路径，后面再接成本、token、checkpoint、resume command 和 trace evidence，风险会小很多。
