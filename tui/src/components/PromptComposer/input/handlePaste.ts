import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import { PASTE_FAILED_HINT } from '@constants/ui.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import { setTransientStatusHintAtom } from '@state/ui/index.ts';
import { insertComposerTextAtom } from '@state/ui/composer/index.ts';
import { sanitizePastedText } from '@libs/composer/pastedText.ts';
import { isClipboardPasteShortcut } from '@libs/keyboard/clipboardShortcuts.ts';

let readInFlight = false;

/** Handles raw terminal paste shortcuts by reading the injected clipboard seam. */
export const handlePaste: ComposerKeyHandler = ({ input, key, maxBytes, store }) => {
  if (!isClipboardPasteShortcut(input, key)) {
    return false;
  }

  if (readInFlight) {
    return true;
  }

  const clipboardClient = store.get(clipboardClientAtom);
  if (clipboardClient === undefined) {
    store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
    return true;
  }

  readInFlight = true;
  void clipboardClient.readText()
    .then((text) => {
      if (text === null || text === undefined) {
        store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
        return;
      }
      store.set(insertComposerTextAtom, { maxBytes, text: sanitizePastedText(text) });
    })
    .catch(() => {
      store.set(setTransientStatusHintAtom, { text: PASTE_FAILED_HINT });
    })
    .finally(() => {
      readInFlight = false;
    });

  return true;
};
