import type { createStore } from 'jotai';
import { PASTE_FAILED_HINT } from '@constants/ui.ts';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';
import { parseMouseRightClickEvent } from '@libs/terminal/mouse.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import { setTransientStatusHintAtom } from '@state/ui/index.ts';
import { insertComposerTextAtom } from '@state/ui/composer/index.ts';

type Store = ReturnType<typeof createStore>;

/** Reads the clipboard and inserts it when `input` is an SGR right-click. */
export function handleRightClickPaste(input: string, store: Store): boolean {
  const rightClick = parseMouseRightClickEvent(input);
  if (rightClick === null) {
    return false;
  }

  const clipboardClient = store.get(clipboardClientAtom);
  if (clipboardClient === undefined) {
    store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
    return true;
  }

  void clipboardClient.readText()
    .then((text) => {
      if (text === null || text === undefined) {
        store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
        return;
      }
      store.set(insertComposerTextAtom, { text: sanitizePastedText(text) });
    })
    .catch(() => {
      store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
    });
  return true;
}
