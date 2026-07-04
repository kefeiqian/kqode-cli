---
sidebar_position: 2
title: 2. packaged 入口为何独立
---

U9 新增 [`tui/packaged/entry.packaged.tsx`](https://github.com/kefeiqian/KQode/blob/f642fb3b65bad29da3497d77967af741424205ca/tui/packaged/entry.packaged.tsx)。它和 source entry 一样渲染 `App`，但额外注入 embedded backend asset loader。

```tsx
const { store, dispose } = await createAppRuntime({
  entryUrl: import.meta.url,
  loadPackagedAsset: loadEmbeddedBackendAsset
});

const { waitUntilExit } = render(
  <Provider store={store}>
    <App />
  </Provider>,
  { incrementalRendering: true }
);

void waitUntilExit().finally(() => finishSession({ store, dispose }));
```

![source 入口和 packaged 入口共享 App 但分离组合根](../../images/u9-standalone-executable/packaged-entry-composition-root.png)

为什么不直接复用 `main.tsx`？因为 packaged entry 需要 import Bun-only asset API。[`tui/packaged/embeddedBackendAsset.ts`](https://github.com/kefeiqian/KQode/blob/f642fb3b65bad29da3497d77967af741424205ca/tui/packaged/embeddedBackendAsset.ts) 里有这样的代码：

```ts
import backendAssetPath from './assets/kqode-backend' with { type: 'file' };

export function loadEmbeddedBackendAsset(): EmbeddedBackendAsset {
  return {
    sha256: process.env.KQODE_BACKEND_SHA256 ?? '',
    readBytes: async () => Buffer.from(await Bun.file(backendAssetPath).bytes())
  };
}
```

`with { type: 'file' }` 和 `Bun.file` 只属于 Bun compile。把它们放进 `src/` 或 `main.tsx`，会污染 `tsc`、Vitest 和 source-mode `tsx` 的模块图。U9 选择独立 entry，是为了让 runtime-specific 依赖停留在 composition root，而不是扩散进产品 UI。

代价是入口有一点重复；收益是 source mode 和 packaged mode 共享 `App`、store、exit summary 和 terminal 行为，只在 backend asset 来源上分叉。入口可以分开，产品行为不能分叉。
