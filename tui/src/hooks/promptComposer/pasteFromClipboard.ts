import type { createStore } from 'jotai';
import { PASTE_FAILED_HINT, RIGHT_CLICK_PASTE_DEDUP_MS } from '@constants/ui.ts';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';
import { readClipboardAtom } from '@state/global/index.ts';
import { commandMenuDismissedAtom, resetCommandHighlightAtom } from '@state/ui/commands/index.ts';
import { composerStateAtom, insertComposerTextAtom } from '@state/ui/composer/index.ts';
import {
  claimRightClickPasteReadAtom,
  type ComposerPasteTarget,
  finalizeRightClickPasteFailureAtom,
  resolveRightClickPasteFailureAtom,
  setTransientStatusHintAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

type PasteFromClipboardOptions = {
  operationId?: number;
};

/** Inserts sanitized pasted text and refreshes command-menu filtering. */
export function insertPastedText(store: Store, text: string, maxBytes: number): void {
  store.set(setTransientStatusHintAtom, undefined);
  store.set(insertComposerTextAtom, { maxBytes, text: sanitizePastedText(text) });
  store.set(resetCommandHighlightAtom);
  store.set(commandMenuDismissedAtom, false);
}

/** Reads the injected clipboard and inserts its text into the composer. */
export function pasteFromClipboard(
  store: Store,
  maxBytes: number,
  options: PasteFromClipboardOptions = {}
): void {
  void store
    .set(readClipboardAtom)
    .then((text) => {
      if (text === null) {
        resolvePasteFailure(store, options);
        return;
      }

      const sanitizedText = sanitizePastedText(text);
      if (!claimPasteResult(store, options)) {
        return;
      }
      insertPastedText(store, sanitizedText, maxBytes);
    })
    .catch(() => {
      resolvePasteFailure(store, options);
    });
}

function claimPasteResult(
  store: Store,
  { operationId }: PasteFromClipboardOptions
): boolean {
  if (operationId === undefined) {
    return true;
  }

  return store.set(claimRightClickPasteReadAtom, {
    operationId,
    target: composerTarget(store)
  });
}

function resolvePasteFailure(
  store: Store,
  { operationId }: PasteFromClipboardOptions
): void {
  if (operationId === undefined) {
    store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
    return;
  }

  const resolution = store.set(resolveRightClickPasteFailureAtom, {
    operationId,
    target: composerTarget(store)
  });
  if (resolution.kind === 'ignore') {
    return;
  }

  setTimeout(() => {
    if (
      store.set(finalizeRightClickPasteFailureAtom, {
        operationId,
        target: composerTarget(store)
      })
    ) {
      store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
    }
  }, RIGHT_CLICK_PASTE_DEDUP_MS);
}

/** Current composer target used to reject late right-click paste completions. */
export function composerTarget(store: Store): ComposerPasteTarget {
  const state = store.get(composerStateAtom);
  return { cursorIndex: state.cursorIndex, text: state.text };
}
