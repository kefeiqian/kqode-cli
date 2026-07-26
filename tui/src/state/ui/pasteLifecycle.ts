import { atom } from 'jotai';
import { RIGHT_CLICK_PASTE_DEDUP_MS } from '@constants/ui.ts';
import { sameComposerPasteTarget } from '@libs/composer/pasteTarget.ts';
import {
  type ComposerPasteTarget,
  rightClickOperationCounterAtom,
  rightClickPasteStateAtom
} from '@state/ui/pasteState.ts';

export type PasteFailureResolution =
  | { kind: 'ignore' }
  | { kind: 'wait' };

export const beginRightClickCopyAtom = atom(null, (_get, set, now: number = Date.now()) => {
  set(rightClickPasteStateAtom, {
    kind: 'copy',
    suppressUntil: now + RIGHT_CLICK_PASTE_DEDUP_MS
  });
});

export const beginRightClickPasteAtom = atom(
  null,
  (
    get,
    set,
    {
      bufferNative,
      target
    }: {
      bufferNative: boolean;
      target: ComposerPasteTarget;
    }
  ) => {
    const current = get(rightClickPasteStateAtom);
    if (
      current?.kind === 'paste' &&
      (current.status === 'pending' || current.status === 'buffered') &&
      sameComposerPasteTarget(current.target, target)
    ) {
      return { operationId: current.operationId, started: false };
    }

    const operationId = get(rightClickOperationCounterAtom) + 1;
    set(rightClickOperationCounterAtom, operationId);
    set(rightClickPasteStateAtom, {
      bufferNative,
      kind: 'paste',
      operationId,
      status: 'pending',
      target
    });
    return { operationId, started: true };
  }
);

export const claimRightClickPasteReadAtom = atom(
  null,
  (
    get,
    set,
    {
      operationId,
      target,
      now = Date.now()
    }: {
      operationId: number;
      target: ComposerPasteTarget;
      now?: number;
    }
  ) => {
    const current = get(rightClickPasteStateAtom);
    if (current?.kind !== 'paste' || current.operationId !== operationId) {
      return false;
    }

    if (current.status === 'inserted') {
      set(rightClickPasteStateAtom, null);
      return false;
    }
    if (current.status === 'cancelled') {
      return false;
    }
    if (!sameComposerPasteTarget(current.target, target)) {
      set(rightClickPasteStateAtom, {
        kind: 'paste',
        operationId,
        status: 'cancelled',
        suppressUntil: now + RIGHT_CLICK_PASTE_DEDUP_MS
      });
      return false;
    }

    set(rightClickPasteStateAtom, {
      kind: 'paste',
      operationId,
      status: 'inserted',
      suppressUntil: now + RIGHT_CLICK_PASTE_DEDUP_MS
    });
    return true;
  }
);

export const resolveRightClickPasteFailureAtom = atom(
  null,
  (
    get,
    set,
    {
      operationId,
      target
    }: {
      operationId: number;
      target: ComposerPasteTarget;
    }
  ): PasteFailureResolution => {
    const current = get(rightClickPasteStateAtom);
    if (current?.kind !== 'paste' || current.operationId !== operationId) {
      return { kind: 'ignore' };
    }

    if (current.status === 'inserted') {
      set(rightClickPasteStateAtom, null);
      return { kind: 'ignore' };
    }
    if (current.status === 'cancelled' || current.status === 'readFailed') {
      return { kind: 'ignore' };
    }
    if (!sameComposerPasteTarget(current.target, target)) {
      set(rightClickPasteStateAtom, {
        kind: 'paste',
        operationId,
        status: 'cancelled',
        suppressUntil: Date.now() + RIGHT_CLICK_PASTE_DEDUP_MS
      });
      return { kind: 'ignore' };
    }
    set(rightClickPasteStateAtom, {
      allowNativeFallback:
        current.status === 'pending' && current.bufferNative === false,
      kind: 'paste',
      operationId,
      status: 'readFailed',
      target: current.target
    });
    return { kind: 'wait' };
  }
);

export const finalizeRightClickPasteFailureAtom = atom(
  null,
  (
    get,
    set,
    {
      operationId,
      target
    }: {
      operationId: number;
      target: ComposerPasteTarget;
    }
  ) => {
    const current = get(rightClickPasteStateAtom);
    if (
      current?.kind !== 'paste' ||
      current.operationId !== operationId ||
      current.status !== 'readFailed'
    ) {
      return false;
    }

    if (!sameComposerPasteTarget(current.target, target)) {
      set(rightClickPasteStateAtom, {
        kind: 'paste',
        operationId,
        status: 'cancelled',
        suppressUntil: Date.now() + RIGHT_CLICK_PASTE_DEDUP_MS
      });
      return false;
    }

    set(rightClickPasteStateAtom, null);
    return true;
  }
);
