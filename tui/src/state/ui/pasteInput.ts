import { atom } from 'jotai';
import { RIGHT_CLICK_PASTE_DEDUP_MS } from '@constants/ui.ts';
import { sameComposerPasteTarget } from '@libs/composer/pasteTarget.ts';
import type { ComposerPasteTarget } from '@state/ui/pasteState.ts';
import { rightClickPasteStateAtom } from '@state/ui/pasteState.ts';

export const shouldInsertBracketedPasteAtom = atom(
  null,
  (
    get,
    set,
    {
      target,
      now = Date.now()
    }: {
      target: ComposerPasteTarget;
      now?: number;
    }
  ) => {
    const current = get(rightClickPasteStateAtom);
    if (current === null) {
      return true;
    }

    if (current.kind === 'copy') {
      set(rightClickPasteStateAtom, null);
      return now > current.suppressUntil;
    }

    if (current.status === 'cancelled') {
      set(rightClickPasteStateAtom, null);
      return now > current.suppressUntil;
    }

    if (current.status === 'inserted') {
      set(rightClickPasteStateAtom, null);
      return now > current.suppressUntil;
    }

    if (!sameComposerPasteTarget(current.target, target)) {
      set(rightClickPasteStateAtom, {
        kind: 'paste',
        operationId: current.operationId,
        status: 'cancelled',
        suppressUntil: now + RIGHT_CLICK_PASTE_DEDUP_MS
      });
      return false;
    }

    if (current.status === 'buffered') {
      return false;
    }

    if (current.status === 'readFailed') {
      if (!current.allowNativeFallback) {
        return false;
      }
      set(rightClickPasteStateAtom, null);
      return true;
    }

    if (current.bufferNative) {
      set(rightClickPasteStateAtom, {
        kind: 'paste',
        operationId: current.operationId,
        status: 'buffered',
        target: current.target
      });
      return false;
    }

    set(rightClickPasteStateAtom, {
      kind: 'paste',
      operationId: current.operationId,
      status: 'inserted',
      suppressUntil: now + RIGHT_CLICK_PASTE_DEDUP_MS
    });
    return true;
  }
);

export const cancelPendingRightClickPasteAtom = atom(
  null,
  (get, set, now: number = Date.now()) => {
    const current = get(rightClickPasteStateAtom);
    if (
      current?.kind === 'paste' &&
      (current.status === 'pending' ||
        current.status === 'buffered' ||
        current.status === 'readFailed')
    ) {
      set(rightClickPasteStateAtom, {
        kind: 'paste',
        operationId: current.operationId,
        status: 'cancelled',
        suppressUntil: now + RIGHT_CLICK_PASTE_DEDUP_MS
      });
    }
  }
);
