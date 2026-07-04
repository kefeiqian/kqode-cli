---
sidebar_position: 2
title: 2. 迁移到 Jotai：store 与派生原子
---

U3 的主线是把主界面共享状态从“props 透传 + `useState`”迁到 Jotai。这一篇讲状态是怎么组织的：一个独立 store、一个根配置 atom、一堆从它派生出来的只读 atom，以及封装“动作”的只写 atom。

## 为什么用 Jotai

主界面有十几个需要被多个组件读取的派生值（布局行数、滚动偏移、已提交消息、composer 行数……）。在 U2 里，这些要么在 `HomeScreen` 里 `useState` 再往下传，要么靠回调往上抬，叶子组件的参数越来越多。Jotai 让每个组件**按需订阅**自己关心的那一个 atom——`HomeStatus` 只读模型名，`HomeBody` 只读正文和滚动，谁也不用背一长串 props。

选 Jotai 而不是 Redux/Context 的理由：它是原子化的，派生 atom 用 `get` 组合就行，天然适合“很多互相依赖的小片派生状态”这种形态；而且没有 reducer/action-type 的样板。这条选择也写进了项目约定——**共享状态用 Jotai，孤立的编辑状态仍可内聚**（composer 就是后者，见下文）。

## 状态边界：每个主界面一个 store

`HomeScreen` 不再自持状态，而是创建一个**独立的 Jotai store**，把 config 写进根 atom，再用 `Provider` 包住渲染：

```tsx
export function HomeScreen({ config }: HomeScreenProps) {
  const store = useHomeScreenStore(config);

  return (
    <Provider store={store}>
      <HomeScreenView />
    </Provider>
  );
}

function useHomeScreenStore(config: HomeScreenConfig): ReturnType<typeof createStore> {
  const storeRef = useRef<ReturnType<typeof createStore> | null>(null);

  if (storeRef.current === null) {
    const store = createStore();
    store.set(homeScreenConfigAtom, config);
    storeRef.current = store;
  }

  useLayoutEffect(() => {
    storeRef.current?.set(homeScreenConfigAtom, config);
  }, [config]);

  return storeRef.current;
}
```

为什么用**显式 store**（`createStore()`）而不是全局默认 store？因为这样每个 `HomeScreen` 实例的状态互相隔离——测试里可以并行渲染多个而不串扰，未来多屏/多会话也不会共享同一份全局 atom。`useRef` 保证 store 只建一次，`useLayoutEffect` 在 config（如终端 resize 后的新尺寸）变化时把最新值写回根 atom。

## 根配置原子与默认值

`homeScreenConfigAtom` 是整棵状态树的根，占位初值由 `HomeScreen` 在建 store 时覆盖。外部只传必要字段，其余由 `createHomeScreenConfig` 补默认值：

```ts
export const DEFAULT_MODEL_LABEL = 'GPT-5.5';
export const noopPromptSubmit = () => {};

export function createHomeScreenConfig({
  productVersion, workspaceCwd, gitStatusLabel,
  modelLabel = DEFAULT_MODEL_LABEL, bodyEntries,
  columns = DEFAULT_COLUMNS, rows = DEFAULT_ROWS,
  onPromptSubmit = noopPromptSubmit
}: HomeScreenOptions): HomeScreenConfig {
  return { productVersion, workspaceCwd, gitStatusLabel, modelLabel, bodyEntries, columns, rows, onPromptSubmit };
}
```

`onPromptSubmit` 默认是空函数——没接后端时提交也不报错，测试里也可以不传。

## 派生原子：把 U2 的内联计算搬出来

U2 里 `HomeScreen` 内联算的那些量（正文合并、布局、spacer、composerTop、滚动上限），在 U3 全部变成 `homeScreenAtoms.ts` 里的派生 atom。例如“最终要渲染的正文”：

```ts
export const displayedBodyEntriesAtom = atom((get) => {
  const config = get(homeScreenConfigAtom);
  const submittedPromptEntries = get(submittedPromptEntriesAtom);
  const baseBodyEntries = config.bodyEntries ?? DEFAULT_BODY_ENTRIES;

  return submittedPromptEntries.length === 0
    ? config.bodyEntries ?? DEFAULT_BODY_ENTRIES
    : [...baseBodyEntries, ...submittedPromptEntries];
});
```

而 `layoutAtom` 订阅了 `composerRowsAtom` 和 `displayedBodyEntriesAtom`，所以**输入框一长高、或正文一变多，布局立刻重算**——这就是动态行移位的来源，和 U2 内联算的效果一样，只是现在依赖关系是声明式的。

## 动作用只写原子封装

“提交一条 prompt”这种动作，封装成只写 atom（read 部分为 `null`）：

```ts
export const submitPromptAtom = atom(null, (get, set, prompt: string) => {
  const config = get(homeScreenConfigAtom);
  set(submittedPromptEntriesAtom, (current) => [...current, { kind: 'prompt', text: prompt }]);
  set(bodyScrollOffsetRowsAtom, 0);
  config.onPromptSubmit(prompt);
});
```

它做的三件事和 U2 的 `handlePromptSubmit` 一模一样（追加消息、滚动归零、回调外部），只是从组件方法变成了一个可被任意组件 `set` 的原子。滚动也是同样的模式：`bodyScrollOffsetRowsAtom` 存偏移，`scrollBodyByRowsAtom` 负责按增量滚动并夹在合法区间。

## composer：从 reducer 到 atom，但仍内聚

输入框状态在 U2 是一个 `composerReducer`。U3 把它改写成 Jotai atom，但**刻意保持内聚**——一个 `composerStateAtom` 存全部状态，外加一组只写“动作 atom”：

```ts
export const composerStateAtom = atom<ComposerState>(initialComposerState);

export const insertComposerTextAtom = atom(
  null,
  (_get, set, { maxBytes = PROMPT_MAX_BYTES, text: insertedText }: InsertTextOptions) => {
    if (insertedText.length === 0) return;
    set(composerStateAtom, (state) => {
      const cursorIndex = clampCursorIndex(state.text, state.cursorIndex);
      const text = state.text.slice(0, cursorIndex) + insertedText + state.text.slice(cursorIndex);
      return { text, cursorIndex: cursorIndex + insertedText.length, validationError: overLimitMessage(text, maxBytes) };
    });
  }
);
```

每个动作（insert / deleteBackward / moveCursor* / clear / setValidationError）都是一个只写 atom，逻辑和 U2 reducer 的对应分支一字不差（包括代理对光标、64 KiB 校验）。为什么不把它也铺平成一堆散的 atom？因为输入框状态只有 `PromptComposer` 一个 owner，把 `text`/`cursorIndex`/`validationError` 收在一个 `composerStateAtom` 里，语义更清楚、也更好测。这体现了“共享状态上 Jotai、局部编辑状态保持内聚”的取舍——迁移工具变了，边界原则没变。

下一篇看巨石组件是怎么按 200 行约定拆开的。
