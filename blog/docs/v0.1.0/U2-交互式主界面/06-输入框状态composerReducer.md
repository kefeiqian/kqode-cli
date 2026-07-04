---
sidebar_position: 6
title: 6. 输入框状态：composerReducer
---

输入框的状态没有用全局容器，而是一个内聚的 reducer——[`composerReducer.ts`](https://github.com/kefeiqian/KQode/blob/dd15b678392eacc2ffcee88884eba18ae52c1236/tui/src/state/composerReducer.ts)。它管三样东西：当前文本、光标位置、校验错误。

## 为什么是 reducer 而不是全局状态

输入框的编辑状态是**高度局部**的：只有 `PromptComposer` 自己在读写 `text`/`cursorIndex`/`validationError`，别的组件不关心。这种“单一 owner、频繁变更”的状态，用 `useReducer` 把所有变更收进一个纯函数，比散落的 `useState` 更好测、也更好推理。这也是项目的约定——共享状态才上 Jotai，孤立的编辑状态保持组件内聚（这条约定在 [U3](/category/u3-jotai-state-refactor) 迁移 Jotai 时依然保留了 composer 的这种风格）。

状态形状和动作：

```ts
export const PROMPT_MAX_BYTES = 64 * 1024;

type ComposerState = {
  text: string;
  cursorIndex: number;
  validationError: string | null;
};

type ComposerAction =
  | { type: 'insert'; text: string; maxBytes?: number }
  | { type: 'deleteBackward'; maxBytes?: number }
  | { type: 'moveCursorBackward' }
  | { type: 'moveCursorForward' }
  | { type: 'clear' }
  | { type: 'setValidationError'; message: string | null };
```

## 插入与删除：都要重算校验

`insert` 在光标处切开文本插入，并顺手更新“是否超限”的校验：

```ts
case 'insert': {
  if (action.text.length === 0) {
    return state;
  }
  const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
  const text = state.text.slice(0, cursorIndex) + action.text + state.text.slice(cursorIndex);
  return {
    text,
    cursorIndex: cursorIndex + action.text.length,
    validationError: overLimitMessage(text, action.maxBytes ?? PROMPT_MAX_BYTES)
  };
}
```

注意几处“不做无用功”：空插入直接原样返回 `state`（不触发重渲染）；每次改文本都重算 `overLimitMessage`，让校验始终跟文本同步。

## Unicode 光标：按 code point 移动

终端里一个 emoji 或中文字符可能是 JS 字符串里的**两个 code unit**（代理对）。如果光标按 code unit 移动，就会“卡”在字符中间、删半个字符。所以移动和删除都按 code point 边界走：

```ts
function previousCodePointStart(text: string, cursorIndex: number): number {
  const previousIndex = cursorIndex - 1;
  const previousCodeUnit = text.charCodeAt(previousIndex);
  const offset = previousCodeUnit >= 0xdc00 && previousCodeUnit <= 0xdfff ? 2 : 1; // 低代理 → 跨 2
  return Math.max(0, cursorIndex - offset);
}

function nextCodePointEnd(text: string, cursorIndex: number): number {
  const currentCodeUnit = text.charCodeAt(cursorIndex);
  const offset = currentCodeUnit >= 0xd800 && currentCodeUnit <= 0xdbff ? 2 : 1; // 高代理 → 跨 2
  return Math.min(text.length, cursorIndex + offset);
}
```

判断代理对区间（`0xD800–0xDBFF` 高位、`0xDC00–0xDFFF` 低位）决定跨 1 还是跨 2。这样左右方向键和退格都以“整个字符”为单位。

## 提交校验：空与超限

提交时先跑 `validateComposerSubmit`，分成三种结果：

```ts
export function validateComposerSubmit(text: string, maxBytes = PROMPT_MAX_BYTES): SubmitValidation {
  if (text.trim().length === 0) {
    return { ok: false, reason: 'empty', message: '' };
  }
  const limitMessage = overLimitMessage(text, maxBytes);
  if (limitMessage !== null) {
    return { ok: false, reason: 'over-limit', message: limitMessage };
  }
  return { ok: true, text };
}
```

- **空（只有空白）**：静默拒绝，不报错也不提交——回车一个空行不该有任何反馈。
- **超限**：`64 KiB` 是按 **UTF-8 字节数**算的（`TextEncoder`），不是字符数，因为下游后端和存储关心的是字节。超限时给出明确的字节数错误。
- **通过**：返回 trim 前的原文（保留用户输入的首尾空格由后续决定）。

为什么限 64 KiB？既要允许粘贴一大段代码/日志，又要防止有人把一个几 MB 的文件粘进来把 UI 和后端撑爆。64 KiB 是个宽松但有上限的折中。

## 净化输入：printableInput

从终端读到的原始输入可能夹着控制字符（方向键、粘贴的转义序列碎片等）。`printableInput` 在插入前把它们剔掉：

```ts
export function printableInput(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, '');
}
```

它去掉 C0 控制字符和 DEL，只留可打印内容。真正的功能键（回车、退格、方向键）在 `PromptComposer` 的 `useInput` 里已经被单独处理，不会走到这里。

下一篇看 `PromptComposer` 怎么把这个 reducer 接上键盘、渲染成带光标的输入框。
