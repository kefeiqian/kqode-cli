import { atom } from 'jotai';
import type { ClipboardClient } from '@contracts/clipboard/index.ts';

/** Injected clipboard seam used by transcript copy and composer paste. */
export const clipboardClientAtom = atom<ClipboardClient | undefined>(undefined);

const clipboardOperationTailAtom = atom<Promise<void>>(Promise.resolve());
const clipboardWritePendingCountAtom = atom(0);

export const clipboardWritePendingAtom = atom(
  (get) => get(clipboardWritePendingCountAtom) > 0
);

/** Queues a clipboard read after every previously started clipboard operation. */
export const readClipboardAtom = atom(null, (get, set): Promise<string | null> => {
  const client = get(clipboardClientAtom);
  const operation =
    client === undefined
      ? Promise.resolve(null)
      : get(clipboardOperationTailAtom)
          .then(() => client.readText())
          .catch(() => null);

  set(clipboardOperationTailAtom, operation.then(() => undefined));
  return operation;
});

/** Queues a clipboard write so a subsequent read cannot observe stale contents. */
export const writeClipboardAtom = atom(null, (get, set, text: string): Promise<boolean> => {
  const client = get(clipboardClientAtom);
  set(clipboardWritePendingCountAtom, (count) => count + 1);
  const operation = (
    client === undefined
      ? Promise.resolve(false)
      : get(clipboardOperationTailAtom)
          .then(() => client.writeText(text))
          .catch(() => false)
  ).finally(() => {
    set(clipboardWritePendingCountAtom, (count) => Math.max(0, count - 1));
  });

  set(clipboardOperationTailAtom, operation.then(() => undefined));
  return operation;
});
