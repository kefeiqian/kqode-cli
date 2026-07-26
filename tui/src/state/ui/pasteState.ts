import { atom } from 'jotai';
import type { ComposerPasteTarget as ComposerPasteTargetValue } from '@libs/composer/pasteTarget.ts';

export type ComposerPasteTarget = ComposerPasteTargetValue;

export type RightClickPasteState =
  | {
      kind: 'copy';
      suppressUntil: number;
    }
  | {
      bufferNative: boolean;
      kind: 'paste';
      operationId: number;
      status: 'pending';
      target: ComposerPasteTarget;
    }
  | {
      kind: 'paste';
      operationId: number;
      status: 'buffered';
      target: ComposerPasteTarget;
    }
  | {
      allowNativeFallback: boolean;
      kind: 'paste';
      operationId: number;
      status: 'readFailed';
      target: ComposerPasteTarget;
    }
  | {
      kind: 'paste';
      operationId: number;
      status: 'inserted';
      suppressUntil: number;
    }
  | {
      kind: 'paste';
      operationId: number;
      status: 'cancelled';
      suppressUntil: number;
    };

export const rightClickOperationCounterAtom = atom(0);
export const rightClickPasteStateAtom = atom<RightClickPasteState | null>(null);
