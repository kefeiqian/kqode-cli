---
sidebar_position: 3
title: 3. composer 提交到 ACK 回显
---

U8 的核心路径在 [`enqueuePromptAtom`](https://github.com/kefeiqian/KQode/blob/bcc8130e137f37b8dc0884918768f3b1fc5fc1ef/tui/src/state/backend/atoms.ts)。提交的原始文本先进入队列；如果已有 active 请求，新 prompt 就标记为 `queued`，否则立即成为 `active`。

```ts
export const enqueuePromptAtom = atom(null, async (get, set, rawText: string) => {
  const hasActive = get(promptQueueAtom).some((item) => item.state === 'active');
  const item: QueueItem = {
    id: nextQueueItemId++,
    text: rawText,
    state: hasActive ? 'queued' : 'active'
  };

  set(promptQueueAtom, (queue) => [...queue, item]);
  set(bodyScrollOffsetRowsAtom, 0);
  syncBodyEntries(get, set);
  await drainQueue(get, set);
});
```

![composer 提交后立即进入正文队列](../../images/u8-submit-ack-wiring/composer-submit-queue.png)

prompt 立即显示，是为了让用户知道 Enter 已经生效。如果等后端 ACK 回来才显示，慢请求会像输入丢失。U8 先 append prompt，再异步 drain queue，交互反馈更可靠。

```ts
async function drainQueue(get: Getter, set: Setter): Promise<void> {
  if (get(drainingAtom)) {
    return;
  }

  set(drainingAtom, true);
  try {
    let active = findActive(get);
    while (active !== undefined) {
      const result = await runBackendRequest(get, active.text);
      settleActive(get, set, active.id, result);
      active = findActive(get);
    }
  } finally {
    set(drainingAtom, false);
  }
}
```

为什么要 FIFO，而不是并发把所有 prompt 发出去？因为这个阶段要先证明结果归属：每个 prompt 后面跟自己的 ACK 或错误。并发会提前引入乱序结果和取消语义，超过 U8 的目标。

ACK 显示文案在前端拼接：

```ts
const ack = await backendClient.submitMessage({ text });
return {
  kind: 'success',
  text: sanitizeDisplayText(`Rust backend ACK - received: ${ack.receivedText}`)
};
```

后端仍然只返回协议结果；UI 决定怎样把这个 proof 展示给用户。这样未来真实 assistant message 出现时，可以替换展示层，而不用推翻底层 JSON-RPC ACK contract。
