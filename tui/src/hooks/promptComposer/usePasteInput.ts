import { usePaste } from 'ink';
import { useStore } from 'jotai';
import { useEffect } from 'react';
import {
  composerTarget,
  insertPastedText
} from '@hooks/promptComposer/pasteFromClipboard.ts';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';
import {
  cancelPendingRightClickPasteAtom,
  shouldInsertBracketedPasteAtom
} from '@state/ui/index.ts';

/** Handles bracketed terminal paste and suppresses duplicate right-click fallout. */
export function usePasteInput(maxBytes: number): void {
  const store = useStore();

  usePaste((text) => {
    const sanitizedText = sanitizePastedText(text);
    if (
      !store.set(shouldInsertBracketedPasteAtom, {
        target: composerTarget(store)
      })
    ) {
      return;
    }

    insertPastedText(store, sanitizedText, maxBytes);
  });

  useEffect(
    () => () => {
      store.set(cancelPendingRightClickPasteAtom);
    },
    [store]
  );
}
