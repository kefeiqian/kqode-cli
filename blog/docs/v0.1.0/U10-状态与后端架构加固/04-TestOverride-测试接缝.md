---
sidebar_position: 4
title: 4. TestOverride 测试接缝
---

U10 引入了一个很重要的命名约定：测试专用的 DI seam 用 `TestOverride` 后缀标出来，例如 `columnsTestOverrideAtom`、`rowsTestOverrideAtom`、`gitStatusLabelTestOverrideAtom`。这不是审美问题，而是为了把“生产状态”和“测试覆盖入口”在代码搜索和 code review 中区分开。

![TestOverride 测试接缝](../../images/u10-architecture-hardening/testoverride-seams.png)

## 为什么测试需要 seam

TUI 测试必须固定窗口宽高、Git 状态和工作目录，否则 snapshot/断言会随机器环境变化。例如真实 terminal 可能是 80x24，也可能是 120x40；真实 Git workspace 可能干净，也可能有未跟踪文件。没有 seam，测试就会在不同开发者机器上变得不稳定。

U9 通过 `HomeScreenConfig` 注入这些值。U10 拆掉 config 后，需要一种更细粒度的测试入口：测试只覆盖自己关心的 atom，不重新构造整块 screen config。

## `dimensions.ts`：测试覆盖窗口，生产读取真实窗口

[`tui/src/state/global/dimensions.ts`](https://github.com/kefeiqian/KQode/blob/20e31d9aac2736f80989529b98d582d7417b6e51/tui/src/state/global/dimensions.ts) 是最典型的例子：

```ts
export const columnsTestOverrideAtom = /* @__PURE__ */ atom<number | undefined>(undefined);
export const rowsTestOverrideAtom = /* @__PURE__ */ atom<number | undefined>(undefined);
export const windowColumnsAtom = atom<number | undefined>(undefined);
export const windowRowsAtom = atom<number | undefined>(undefined);

export const columnsAtom = atom((get) => {
  const override = __TEST__ ? get(columnsTestOverrideAtom) : undefined;
  return override ?? get(windowColumnsAtom) ?? DEFAULT_COLUMNS;
});
```

这里有三层保护：

1. 名字带 `TestOverride`，读代码时一眼知道这是测试 seam。
2. 只有 `__TEST__` 为 true 时才读取 override。
3. `/* @__PURE__ */` 帮助 production build dead-code eliminate 这些 declaration。

这比“偷偷给 atom 一个可选参数”更安全。生产代码路径不会意外读到测试 override，测试代码也不需要 mock terminal API。

## `rowsAtom` 还承担了 Windows incremental rendering 的 guard

同一个文件里，U10 还把 terminal 高度处理写成一个有注释的全局状态：

```ts
export const FULLSCREEN_GUARD_ROWS = 1;

export const rowsAtom = atom((get) => {
  const override = __TEST__ ? get(rowsTestOverrideAtom) : undefined;
  if (override !== undefined) {
    return Math.max(MIN_ROWS, override);
  }

  const windowRows = get(windowRowsAtom) ?? DEFAULT_ROWS;
  return Math.max(MIN_ROWS, windowRows - FULLSCREEN_GUARD_ROWS);
});
```

`FULLSCREEN_GUARD_ROWS` 的 WHY 很具体：如果 Ink frame 正好填满 terminal 高度，Windows terminal 上可能走 fullscreen clear path，导致每次按键都清屏重绘、scrollback 被擦掉、WezTerm 闪烁。U10 把这条经验放进状态层，而不是散落在 component layout 里。

注意测试 override 会绕过 guard。原因是测试想断言精确 canvas 行数；生产才需要从真实 terminal 高度减去 guard row。这也是 `TestOverride` 命名的价值：它告诉读者这个入口是为了 pin deterministic viewport，不是业务状态。

## Git 状态也使用同样命名

[`tui/src/state/global/gitStatus.ts`](https://github.com/kefeiqian/KQode/blob/20e31d9aac2736f80989529b98d582d7417b6e51/tui/src/state/global/gitStatus.ts) 使用同一套模式：

```ts
export const gitStatusLabelTestOverrideAtom = /* @__PURE__ */ atom<string | undefined>(undefined);

export const gitStatusLabelAtom = atom((get) => {
  const override = __TEST__ ? get(gitStatusLabelTestOverrideAtom) : undefined;
  return override ?? readGitStatusLabel(get(workspaceCwdAtom));
});
```

为什么不能直接在测试里 mock `readGitStatusLabel()`？因为这里测试的不是 Git parser，而是 HomeScreen 如何展示 Git label。把 seam 放在 state 层，可以让 component 测试只关心 UI 输出，同时保留 production path 对真实 Git 状态的读取。

## Vitest 显式打开测试 flag

为了让 `__TEST__` seam 可控，U10 在 [`tui/vitest.config.ts`](https://github.com/kefeiqian/KQode/blob/20e31d9aac2736f80989529b98d582d7417b6e51/tui/vitest.config.ts) 注入 build-env flags：

```ts
export default defineConfig({
  // Inject the build-env flags so `__TEST__`-gated seams are active under Vitest.
  define: {
    __TEST__: 'true',
    __DEV__: 'false',
    __PROD__: 'false'
  },
```

这让测试 seam 的打开方式集中在测试 runner 配置里。以后如果 production bundler 或 dev runner 也定义这些 flags，语义仍然清楚：测试 seam 只应该在 `__TEST__` 下生效。

## 测试代码变得更直接

U10 的 [`HomeScreen.test.tsx`](https://github.com/kefeiqian/KQode/blob/20e31d9aac2736f80989529b98d582d7417b6e51/tui/src/__tests__/components/HomeScreen.test.tsx) 不再构造 `HomeScreenConfig`，而是直接 seed atom：

```tsx
const store = createStore();
store.set(productVersionAtom, productVersion);
store.set(workspaceCwdAtom, screenWorkspaceCwd);
if (gitStatusLabel !== undefined) {
  store.set(gitStatusLabelTestOverrideAtom, gitStatusLabel);
}
if (columns !== undefined) {
  store.set(columnsTestOverrideAtom, columns);
}
if (rows !== undefined) {
  store.set(rowsTestOverrideAtom, rows);
}
```

这段代码读起来更啰嗦一点，但更诚实：测试覆盖了哪些状态，一行一行写出来。相比一个大 config，它不会让测试在无意中依赖不相关字段。

## 为什么后缀比前缀更适合这里

`TestOverride` 放在名字末尾，是因为主要实体仍然是业务 atom：`columns`、`rows`、`gitStatusLabel`。搜索 `columns` 时能看到 `columnsAtom`、`windowColumnsAtom` 和 `columnsTestOverrideAtom`；搜索 `TestOverride` 时又能一次性找到所有测试 seam。

这对后续 code review 很有用。看到新增的 `SomethingTestOverrideAtom`，reviewer 会自然追问：它是否只在 `__TEST__` 下读取？production build 是否会 DCE？有没有更窄的 fake seam？这比一个普通的 `overrideAtom` 更能传达设计意图。
