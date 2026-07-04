---
sidebar_position: 2
title: 2. App 提交状态接线
---

U8 改造了 [`tui/src/App.tsx`](https://github.com/kefeiqian/KQode/blob/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef/tui/src/App.tsx)。之前 `App` 接收 `screen` props 并构造首页配置；现在它只把 terminal size 写入全局状态，然后渲染 `HomeScreen`。

```tsx
export function App() {
  const windowSize = useWindowSize();
  const setWindowColumns = useSetAtom(windowColumnsAtom);
  const setWindowRows = useSetAtom(windowRowsAtom);

  useLayoutEffect(() => {
    setWindowColumns(windowSize.columns);
    setWindowRows(windowSize.rows);
  }, [setWindowColumns, setWindowRows, windowSize.columns, windowSize.rows]);

  return <HomeScreen />;
}
```

![App 把窗口尺寸写入全局状态](../../images/u8-submit-ack-wiring/app-window-state.png)

为什么不继续用 props？静态首页可以靠 props；但 U8 开始，composer、body、backend client、scroll offset 和异步结果都要共享状态。如果每加一个状态都扩展 `AppProps`，`App` 会变成越来越厚的中转站。把它降级成 composition shell 后，状态可以在 Jotai store 里被相关模块直接读取和更新。

[`tui/main.tsx`](https://github.com/kefeiqian/KQode/blob/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef/tui/main.tsx) 也同步变成 store provider 入口：

```tsx
const { store, dispose } = await createAppRuntime({ entryUrl: import.meta.url });

const { waitUntilExit } = render(
  <Provider store={store}>
    <App />
  </Provider>,
  { incrementalRendering: true }
);

void waitUntilExit().finally(() => finishSession({ store, dispose }));
```

这让启动逻辑和 UI 逻辑分开：`createAppRuntime` 准备 store 和 backend lifecycle，`App` 只渲染 UI。测试也因此可以创建一个 store，塞入 fake `backendClientAtom`，不用真实启动 Rust 进程就能验证提交和 ACK 显示。

这个决定也为 U9 铺路。source entry 和 packaged entry 以后可以共享同一个 `App`，只在 runtime composition root 决定 backend client 从 source launch 来，还是从 packaged asset materialize 来。
