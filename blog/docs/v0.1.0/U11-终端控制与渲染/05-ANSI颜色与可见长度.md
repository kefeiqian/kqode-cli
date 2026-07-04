---
sidebar_position: 5
title: 5. ANSI 颜色与可见长度
---

U11 新增 [`ansiColor.ts`](https://github.com/kefeiqian/KQode/blob/97a9a65ddb34dce8404927ea0cd26f6860b2ed00/tui/src/libs/terminal/ansiColor.ts)。这个文件看似只是颜色 helper，但它解决的是终端布局里一个常见问题：ANSI escape bytes 不占屏幕列宽，字符串长度却会把它们算进去。

```ts
/** SGR reset — clears any foreground color set by {@link colorize}. */
export const RESET_SEQUENCE = '\u001B[0m';

const SGR_PATTERN = /\u001B\[[0-9;]*m/g;

export function visibleLength(text: string): number {
  return text.replace(SGR_PATTERN, '').length;
}
```

## 为什么“可见长度”比普通 `text.length` 更重要

Coding Agent TUI 里会有很多带颜色的短文本：diff 的 `+3` / `-1`、状态 badge、审批提示、命令结果摘要。假设一个单元格显示绿色 `+12`，真实 string 可能是：

```text
\u001B[38;2;80;250;123m+12\u001B[0m
```

屏幕上只占 3 列，但 JavaScript 的 `length` 会把 escape sequence 也算进去。如果用普通长度做 padding，box border 会被推歪；如果用普通长度做截断，还可能截断在 escape sequence 中间，污染后续输出颜色。

## 为什么选择 truecolor SGR

前景色函数生成的是 24-bit truecolor sequence：

```ts
/** Builds the truecolor SGR foreground sequence for a `#rrggbb` (or `#rgb`) hex color. */
export function foregroundSequence(hex: string): string {
  const { red, green, blue } = hexToRgb(hex);
  return `\u001B[38;2;${red};${green};${blue}m`;
}

/** Wraps `text` in a truecolor foreground sequence followed by a reset. */
export function colorize(text: string, hex: string): string {
  return `${foregroundSequence(hex)}${text}${RESET_SEQUENCE}`;
}
```

相比 16 色或 256 色，truecolor 可以直接复用设计系统里的 hex token，比如 Dracula 绿色 `#50FA7B`。这减少了“设计颜色”和“终端颜色”之间的转换误差。缺点是非常老的 terminal emulator 可能不支持 24-bit color，但 KQode 当前优先服务现代开发环境；不支持时通常只是颜色降级，不会破坏功能。

## 为什么测试包含 shorthand hex

[`ansiColor.test.ts`](https://github.com/kefeiqian/KQode/blob/97a9a65ddb34dce8404927ea0cd26f6860b2ed00/tui/src/libs/terminal/__tests__/ansiColor.test.ts) 同时测试 `#50FA7B`、`FF5555` 和 `#fff`：

```ts
expect(foregroundSequence('#50FA7B')).toBe('\u001B[38;2;80;250;123m');
expect(foregroundSequence('FF5555')).toBe('\u001B[38;2;255;85;85m');
expect(foregroundSequence('#fff')).toBe('\u001B[38;2;255;255;255m');
```

这说明 helper 的边界不是“只接受一种内部格式”，而是接受常见 CSS hex 写法。原因是 TUI theme token 很可能来自设计文档或 CSS 语境；让 helper 吃掉格式差异，比让每个调用方提前 normalize 更可靠。
