---
sidebar_position: 6
title: 6. 工作目录与 Git 状态
---

cwd 行显示用户正在操作的项目目录，外加一个可选的 Git 状态标签，比如 `~/Projects/KQode [⎇ main*]`。这一篇拆三个文件：展示组件 [`CwdLine.tsx`](https://github.com/kefeiqian/KQode/blob/5432e018cb496e5f7359e69d47a2a7d1691c0794/tui/src/components/CwdLine.tsx)、格式化 helper [`cwdLine.ts`](https://github.com/kefeiqian/KQode/blob/5432e018cb496e5f7359e69d47a2a7d1691c0794/tui/src/libs/tui/cwdLine.ts)、Git 解析 [`gitStatus.ts`](https://github.com/kefeiqian/KQode/blob/5432e018cb496e5f7359e69d47a2a7d1691c0794/tui/src/libs/git/gitStatus.ts)。

## 展示组件 CwdLine

组件本身很薄，只负责把格式化好的字符串渲染成一行前景色文本：

```tsx
export function CwdLine({ workspaceCwd, gitStatusLabel }: CwdLineProps) {
  return (
    <Box>
      <Text color={geminiDarkTheme.colors.foreground}>{formatCwdLine(workspaceCwd, gitStatusLabel)}</Text>
    </Box>
  );
}
```

所有“怎么显示”的逻辑都下沉到了 `cwdLine.ts`，组件保持纯展示。

## 格式化 helper：cwdLine.ts

### 拼接 cwd 与 Git 段

```ts
export function formatCwdLine(workspaceCwd: string, gitStatusLabel?: string): string {
  const cwdSegment = formatDisplayCwd(workspaceCwd);
  const gitSegment = gitStatusLabel === undefined ? '' : ` [${gitStatusLabel}]`;
  return `${cwdSegment}${gitSegment}`;
}
```

Git 标签存在时用方括号包起来加个前导空格，不存在时整段省略。

### home 相对化：formatDisplayCwd

绝对路径又长又泄露用户名，所以把 home 目录折叠成 `~`：

```ts
export function formatDisplayCwd(workspaceCwd: string, homeDir = os.homedir()): string {
  const normalizedCwd = path.normalize(workspaceCwd);
  const normalizedHome = path.normalize(homeDir);
  const compareCwd = normalizePathForComparison(normalizedCwd);
  const compareHome = normalizePathForComparison(normalizedHome);

  if (compareCwd === compareHome) {
    return '~';
  }

  const homePrefix = compareHome.endsWith(path.sep) ? compareHome : `${compareHome}${path.sep}`;
  if (!compareCwd.startsWith(homePrefix)) {
    return normalizedCwd;
  }

  return `~${path.sep}${normalizedCwd.slice(homePrefix.length)}`;
}
```

逻辑分三种情况：

1. cwd 正好等于 home → 直接 `~`。
2. cwd 在 home 下面（以 `home + 分隔符` 开头）→ 把前缀换成 `~`，保留后半段。
3. 否则原样返回归一化后的绝对路径。

注意 `homePrefix` 特意补了路径分隔符再比较，避免 `/home/foobar` 被误判成在 `/home/foo` 下面。比较用的是一个**大小写归一化**的副本：

```ts
function normalizePathForComparison(pathName: string): string {
  return process.platform === 'win32' ? pathName.toLowerCase() : pathName;
}
```

Windows 路径大小写不敏感，所以只在 `win32` 上转小写来比较；但**返回时用的是原始大小写的 `normalizedCwd`**——比较归一化、显示保原样，这是个容易忽略的细节。

### cwd 行数：countCwdRows

长 cwd 会软换行，布局需要知道它占几行：

```ts
export function countCwdRows(workspaceCwd: string, gitStatusLabel: string | undefined, columns: number): number {
  const visibleColumns = Math.max(1, columns);
  return Math.max(1, Math.ceil(formatCwdLine(workspaceCwd, gitStatusLabel).length / visibleColumns));
}
```

就是“整行字符数除以列宽向上取整”，至少 1 行。第 4 篇的 `layoutAtom` 用它把 cwd 的实际行数喂进布局，于是超长 cwd 会软换行而不是把底部 chrome 顶飞。

## Git 解析：gitStatus.ts

这个文件把 `git status` 的 porcelain 输出解析成一个简短标签。入口是 `readGitStatusLabel`，在 `main.tsx` 启动时对 `workspaceCwd` 调一次。

### 跑命令并兜底

```ts
export function readGitStatusLabel(cwd: string): string | undefined {
  try {
    const porcelainStatus = execFileSync(
      'git',
      ['-C', cwd, 'status', '--porcelain=v1', '--branch'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_STATUS_TIMEOUT_MS
      }
    );

    return formatGitStatusLabel(parseGitStatus(porcelainStatus));
  } catch {
    return undefined;
  }
}
```

几个稳健性考量：

- `--porcelain=v1` 给出**稳定、机器可读**的格式，不受用户 Git 配置影响。
- `-C cwd` 让 Git 在 workspace 目录里跑，而不是 TUI 自己的目录。
- `stdio` 把 stderr 设为 `ignore`，非 Git 目录的报错不会污染终端。
- `timeout: 2000`（`GIT_STATUS_TIMEOUT_MS`）防止卡死，比如网络文件系统下的慢仓库。
- 整个 `try/catch`：没装 Git、不是仓库、超时——任何失败都返回 `undefined`，cwd 行就不显示 Git 段。**Git 状态是锦上添花，绝不能让它拖垮启动。**

### 解析分支与改动：parseGitStatus

```ts
export function parseGitStatus(porcelainStatus: string): GitStatus | undefined {
  const lines = porcelainStatus.split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith(STATUS_BRANCH_PREFIX));
  const branch = parseBranchName(branchLine);

  if (branch === undefined) {
    return undefined;
  }

  return lines.reduce<GitStatus>(
    (status, line) => {
      if (line.startsWith(STATUS_BRANCH_PREFIX)) {
        return status;
      }

      return {
        branch: status.branch,
        hasUnstagedChanges:
          status.hasUnstagedChanges || (line[1] !== ' ' && line[1] !== '?' && line[1] !== '!'),
        hasStagedChanges:
          status.hasStagedChanges || (line[0] !== ' ' && line[0] !== '?' && line[0] !== '!'),
        hasUntrackedChanges: status.hasUntrackedChanges || line.startsWith('??')
      };
    },
    {
      branch,
      hasUnstagedChanges: false,
      hasStagedChanges: false,
      hasUntrackedChanges: false
    }
  );
}
```

porcelain 输出的第一行是 `## branch...upstream` 的分支行（前缀 `## `），其余每行前两个字符是“暂存区状态 + 工作区状态”的码。`reduce` 遍历非分支行，按 porcelain 约定累积三个布尔：

- `line[0]`（暂存列）不是空格/`?`/`!` → 有已暂存改动。
- `line[1]`（工作区列）同理 → 有未暂存改动。
- 整行以 `??` 开头 → 有未跟踪文件。

只要解析不出分支名就返回 `undefined`（整段不显示）。

### 分支名的边界情况：parseBranchName

```ts
function parseBranchName(branchLine: string | undefined): string | undefined {
  if (branchLine === undefined) {
    return undefined;
  }

  const branchStatus = branchLine.slice(STATUS_BRANCH_PREFIX.length);

  if (branchStatus.startsWith(NO_COMMITS_BRANCH_PREFIX)) {
    return branchStatus.slice(NO_COMMITS_BRANCH_PREFIX.length);
  }

  if (branchStatus === DETACHED_HEAD_STATUS) {
    return 'HEAD';
  }

  return branchStatus.split(STATUS_UPSTREAM_SEPARATOR)[0].split(' [')[0];
}
```

处理了三种特殊形态：

- 全新仓库 `## No commits yet on main` → 取 `main`。
- 游离 HEAD `## HEAD (no branch)` → 显示 `HEAD`。
- 普通分支 `## main...origin/main [ahead 1]` → 先按 `...` 切掉 upstream，再按 ` [` 切掉 ahead/behind 计数，只留 `main`。

### 拼成标签：formatGitStatusLabel

```ts
export function formatGitStatusLabel(status: GitStatus | undefined): string | undefined {
  if (status === undefined) {
    return undefined;
  }

  return `${GIT_BRANCH_ICON} ${status.branch}${formatGitStatusFlags(status)}`;
}
```

`GIT_BRANCH_ICON` 是 `⎇`，后面跟分支名和改动标记。`formatGitStatusFlags` 把三个布尔拼成 `*`（未暂存）`+`（已暂存）`%`（未跟踪）的组合，比如 `⎇ main*+`。

这些标记都是**非颜色的语义符号**——即使终端不支持颜色或被测试渲染器剥掉色彩，`*`/`+`/`%`/`⎇` 依然能传达状态，符合主题计划文档对“保留非颜色含义标记”的要求。

下一篇进入正文转录区，那里把这些 `BodyEntry` 真正渲染成可滚动、带消息块的多行内容。
