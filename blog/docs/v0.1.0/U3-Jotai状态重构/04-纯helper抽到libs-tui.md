---
sidebar_position: 4
title: 4. 纯 helper 抽到 libs/tui
---

U2 里，`bodyRows.ts`、`layout.ts` 这些纯函数和 `.tsx` 组件混在 `components/` 下。U3 把它们统一搬到 `src/libs/tui/`，让 `components/` 只剩 React 组件。这一篇讲这次迁移，以及背景块从“组件”退化成“常量”的取舍。

## 为什么分 libs/tui

`components/` 应该只放“会渲染的东西”。而布局行数、正文行编译、cwd 格式化、Git 解析这些是**不依赖 React 的纯函数**：给定输入就有确定输出，最容易出错、也最该被单测覆盖。把它们放进 `libs/tui/`（以及 `libs/git`、`libs/text`），边界立刻清晰：

- `libs/` 下的东西可以被任意组件/测试直接调用，不牵扯渲染。
- `components/` 下的 `.tsx` 只管“把算好的数据画出来”。

这次迁移把 `bodyRows.ts`、`layout.ts` 从 `components/` 移到 `libs/tui/`，并新增了 `libs/tui/cwdLine.ts`（把 cwd 行数/文本计算从组件里抽出来），`components/` 这边只留 `BodyPane.tsx`、`CwdLine.tsx` 这些展示组件。

## 背景块：从组件到两个常量

U2 的半行背景块是一个 `BackgroundBlock.tsx` 组件（带 `mode`、`shouldRenderBackgroundBlock` 等逻辑）。重构时发现一个事实：**真正需要复用的只有 `▄`/`▀` 这两个 glyph**，而“怎么把它们拼成块”在正文和输入框里根本不一样——正文拼的是 `BodyRow` 数据，输入框拼的是 JSX。硬用一个组件同时服务两种场景，反而是个别扭的中间抽象。

于是 `BackgroundBlock.tsx` 被砍掉，只留下 `libs/tui/backgroundBlock.ts` 里的两个常量：

```ts
export const LOWER_HALF_BLOCK = '▄';
export const UPPER_HALF_BLOCK = '▀';
```

由各自的渲染处直接拼接。正文里，`bodyRows.ts` 用它拼消息块的上下边缘：

```ts
function halfLineRow(columns: number, glyph: string): BodyRow {
  return {
    backgroundColor: geminiDarkTheme.colors.bodyBackground,
    color: geminiDarkTheme.colors.messageBackground,
    text: glyph.repeat(columns)
  };
}
```

输入框里，`ComposerFrame.tsx` 用它拼输入框的上下边缘：

```tsx
function ComposerHalfLine({ glyph, columns }: { glyph: string; columns: number }) {
  return (
    <Text
      backgroundColor={geminiDarkTheme.colors.bodyBackground}
      color={geminiDarkTheme.colors.inputBackground}
    >
      {glyph.repeat(Math.max(1, columns))}
    </Text>
  );
}
```

两处都遵循第 2 篇（U2）讲过的半块着色技巧——`color` 是块色、`backgroundColor` 是底色，于是半块字符“实心半边”是块色、另半边是底色，给气泡上下各补出半行留白。区别只是一个产出数据、一个产出 JSX。

这次“砍组件、留常量”是一个很典型的重构判断：**当一个抽象的两个使用点差异大于共性时，与其维护一个别扭的通用组件，不如各自内联、共享最小的原语（这里就是两个字符）。**

## 迁移没有改变行为

要强调的是：这些 helper 的**逻辑一行没改**，只是换了目录、并把 U2 里内联在 `HomeScreen` 的 `resolveHomeScreenLayout`/`countBodyRows` 调用改成从 `libs/tui` 与 atom 里取。布局算法、正文换行、滚动条计算的行为和 [U2](/category/u2-interactive-home-screen) 完全一致——这也是重构的本分：结构变、行为不变。

下一篇看配色切换和写进 `tui/AGENTS.md` 的约定。
