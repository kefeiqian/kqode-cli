---
sidebar_position: 5
title: 5. 工作目录与 Git 状态
---

正文和输入框之间那一行，显示当前工作目录和 Git 状态，比如 `~\Projects\KQode [⎇ main *]`。它由展示组件 [`CwdLine.tsx`](https://github.com/kefeiqian/KQode/blob/dd15b678392eacc2ffcee88884eba18ae52c1236/tui/src/components/CwdLine.tsx)、Git 解析 [`gitStatus.ts`](https://github.com/kefeiqian/KQode/blob/dd15b678392eacc2ffcee88884eba18ae52c1236/tui/src/libs/git/gitStatus.ts)、以及文本裁剪 [`clipText.ts`](https://github.com/kefeiqian/KQode/blob/dd15b678392eacc2ffcee88884eba18ae52c1236/tui/src/libs/text/clipText.ts) 三块组成。

## cwd 行：CwdLine

`CwdLine` 把 cwd 和 Git 标签拼起来，再从左侧裁剪到列宽：

```tsx
export function CwdLine({ workspaceCwd, gitStatusLabel, columns }: CwdLineProps) {
  const cwdSegment = formatDisplayCwd(workspaceCwd);
  const gitSegment = gitStatusLabel === undefined ? '' : ` [${gitStatusLabel}]`;
  const visibleLine = clipTextLeft(`${cwdSegment}${gitSegment}`, Math.max(MIN_VISIBLE_COLUMNS, columns));

  return (
    <Box>
      <Text color={githubDarkTheme.colors.foreground}>{visibleLine}</Text>
    </Box>
  );
}
```

两个设计选择：

- **`~` 缩写 home 目录**：`formatDisplayCwd` 把 home 前缀替换成 `~`，并在 Windows 上做大小写无关比较（`normalizePathForComparison`）。这样长路径更短、也更符合终端用户的直觉。
- **从左裁剪（`clipTextLeft`）**：路径太长时，砍掉**左边**（用 `...` 开头），保留右边的叶子目录和 Git 标签。因为“我在哪个子目录、什么分支”比“完整前缀”更重要。

`clipText.ts` 提供左右两种裁剪，都用 `...` 省略号，并处理列宽小于省略号本身的边界：

```ts
export function clipTextLeft(text: string, maxColumns: number): string {
  if (maxColumns <= 0) return '';
  if (text.length <= maxColumns) return text;
  if (maxColumns <= ELLIPSIS.length) return text.slice(-maxColumns);
  return `${ELLIPSIS}${text.slice(-(maxColumns - ELLIPSIS.length))}`;
}
```

## Git 解析：gitStatus.ts

Git 标签来自对 workspace 跑一次 porcelain status。**最关键的设计是整段 `try/catch` + 超时**：

```ts
export function readGitStatusLabel(cwd: string): string | undefined {
  try {
    const porcelainStatus = execFileSync(
      'git',
      ['-C', cwd, 'status', '--porcelain=v1', '--branch'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_STATUS_TIMEOUT_MS }
    );
    return formatGitStatusLabel(parseGitStatus(porcelainStatus));
  } catch {
    return undefined;
  }
}
```

为什么这么谨慎？因为 KQode 会在任意目录启动——那里可能**没装 git、不是 git 仓库、或者仓库大到 status 卡住**。任何一种情况都不能让主界面崩溃或卡死。所以：

- `timeout: 2000`：巨型仓库 status 慢，2 秒还没结果就放弃，不阻塞 UI。
- `stdio` 把 stderr 设为 `ignore`：不是仓库时 git 会往 stderr 写错误，我们不想让它污染终端。
- `catch` 返回 `undefined`：**失败就不显示 Git 标签，而不是报错**。cwd 行照常显示路径。

这是贯穿 KQode 的一条原则：外部依赖（git、终端能力、后端进程）都要能优雅降级。

## 解析 porcelain 输出

`parseGitStatus` 从 `--porcelain=v1 --branch` 的输出里提取分支名和三类改动：

```ts
return lines.reduce<GitStatus>(
  (status, line) => {
    if (line.startsWith(STATUS_BRANCH_PREFIX)) return status; // "## " 开头是分支行
    return {
      branch: status.branch,
      hasUnstagedChanges: status.hasUnstagedChanges || (line[1] !== ' ' && line[1] !== '?' && line[1] !== '!'),
      hasStagedChanges: status.hasStagedChanges || (line[0] !== ' ' && line[0] !== '?' && line[0] !== '!'),
      hasUntrackedChanges: status.hasUntrackedChanges || line.startsWith('??')
    };
  },
  { branch, hasUnstagedChanges: false, hasStagedChanges: false, hasUntrackedChanges: false }
);
```

porcelain 格式每行前两列是暂存区/工作区状态码：第 0 列是暂存（staged）、第 1 列是工作区（unstaged）、`??` 是未跟踪。这里用**命名常量**判断状态码，而不是散落的魔法字符，符合项目“避免硬编码状态字符串”的约定。分支名解析还处理了三种边界：正常分支、`No commits yet on ...`（新仓库无提交）、`HEAD (no branch)`（detached）。

最后格式化成带图标和 flag 的标签：`⎇ main` 加上 `*`（有未暂存改动）/`+`（有暂存改动）/`%`（有未跟踪文件）：

```ts
export function formatGitStatusLabel(status: GitStatus | undefined): string | undefined {
  if (status === undefined) return undefined;
  return `${GIT_BRANCH_ICON} ${status.branch}${formatGitStatusFlags(status)}`;
}
```

同样，`*`/`+`/`%` 是**文本符号**而非纯颜色，去色也能分辨。

下一篇进入输入框，先看它的状态机——`composerReducer`。
