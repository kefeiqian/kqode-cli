---
sidebar_position: 5
title: 5. Gemini 配色与 TUI 约定
---

U3 除了架构重构，还顺手做了两件“定调子”的事：把配色从 GitHub 深色风换成 Gemini 风格，把主界面的布局/光标约定写进 `tui/AGENTS.md`。这一篇讲这两件事，以及配套的 Jotai 测试助手。

## 配色切换：githubDarkTheme → geminiDarkTheme

U2 用的是 GitHub 深色调色板（`#c9d1d9` 前景、`#141b22` 消息背景）。U3 切换到 Gemini CLI 默认深色配色：

```ts
export const geminiDarkTheme = {
  colors: {
    bodyBackground: '#000000',
    foreground: '#FFFFFF',
    muted: '#AFAFAF',
    accentBlue: '#87AFFF',
    accentGreen: '#D7FFD7',
    warning: '#FFFFAF',
    errorRed: '#FF87AF',
    border: '#878787',
    messageBackground: '#5F5F5F',
    inputBackground: '#5F5F5F'
  }
} as const;
```

和 U2 那份表对比，有两点变化值得说：

- **新增了 `bodyBackground: '#000000'`**。U2 的 github 表没有这个令牌；Gemini 风格需要一个明确的“主界面底色”，它同时也是半行块“未被填充那一半”的颜色（第 4 篇 `halfLineRow` 里 `backgroundColor` 用的就是它）。
- **消息/输入背景统一成 `#5F5F5F`、底色纯黑**。这套灰阶对比更符合 Gemini CLI 的观感。

能这么轻松换肤，正是 U2 那个决策的回报：**颜色全部集中在 `themeConfig.ts`**，没有散落在组件里。换主题只改这一个文件，所有引用处（`bodyRows`、`ComposerFrame`、`StatusBar`……）自动跟着变。这就是“集中语义令牌”的价值。

> 主题仍然是内部静态的——没有 `/theme` 命令、没有持久化、没有自定义主题文件。这些按计划仍在范围之外，当前只需要一份清晰、可集中替换的令牌表。

## 把约定写进 tui/AGENTS.md

U3 新增了 `tui/AGENTS.md`，把主界面最容易在后续改动中被破坏的几条不变量固化下来：

```md
## Terminal layout

Keep the cwd row, prompt composer, and command/status row stuck to the bottom
of the terminal for every shell window size. Keep exactly one blank separator
row between the body area and cwd row ...

The prompt composer starts as one row and grows only when the current prompt
text needs soft wrapping or validation feedback ...

Prompt cursor placement is manually resolved with Ink's cursor API, so it can
drift when vertical layout math changes. When changing body height, spacer rows,
wrapping rows, validation rows, background rows, cwd/composer/status placement,
or `cursorTop` math, explicitly verify the cursor still lands on the active
composer text row ...
```

为什么要专门写下来？因为这几条是**跨改动的隐性契约**：底部吸附、body 与 cwd 之间恰好一个空行、输入框动态涨高、以及“手动光标会随布局数学漂移”。它们在 [U2](/category/u2-interactive-home-screen) 的代码里是对的，但只存在于实现细节里——一旦后面有人改布局，很容易无意中破坏。把它写进 `AGENTS.md`，就等于给未来所有改这块代码的人（包括 AI agent）立了一条“改完请重新验证光标落在输入框文本行上”的规矩。这是把“隐性正确性”变成“显性约定”。

## Jotai 测试助手

迁移到 Jotai 后，测试里渲染任何读 atom 的组件都得包一层 `Provider`。U3 加了个小助手把这件事一次性做掉：

```tsx
export function renderWithJotai(element: ReactElement): ReturnType<typeof render> {
  return render(<Provider store={createStore()}>{element}</Provider>);
}
```

每次调用都用一个**全新的 `createStore()`**，保证测试之间状态互不污染。这也呼应第 2 篇的“显式 store”设计——生产代码和测试都不依赖全局默认 store。

下一篇做 U3 的总结。
