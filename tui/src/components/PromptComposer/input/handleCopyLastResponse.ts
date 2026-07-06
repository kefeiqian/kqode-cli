import type { ComposerKeyHandler } from '@components/PromptComposer/input/types.ts';
import {
  COPY_LAST_RESPONSE_FAILED_HINT,
  COPY_LAST_RESPONSE_KEY,
  COPY_LAST_RESPONSE_NOTHING_HINT,
  COPY_LAST_RESPONSE_SUCCEEDED_HINT
} from '@constants/ui.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import { lastAssistantResponseAtom } from '@state/promptQueue/index.ts';
import { setTransientStatusHintAtom } from '@state/ui/index.ts';

/** Copies the newest settled assistant response to the system clipboard. */
export const handleCopyLastResponse: ComposerKeyHandler = ({ input, key, store }) => {
  if (!(key.ctrl === true && input === COPY_LAST_RESPONSE_KEY)) {
    return false;
  }

  const text = store.get(lastAssistantResponseAtom);
  if (text === undefined) {
    store.set(setTransientStatusHintAtom, { text: COPY_LAST_RESPONSE_NOTHING_HINT });
    return true;
  }

  const clipboardClient = store.get(clipboardClientAtom);
  if (clipboardClient === undefined) {
    store.set(setTransientStatusHintAtom, { text: COPY_LAST_RESPONSE_FAILED_HINT });
    return true;
  }

  void clipboardClient.writeText(text)
    .then((success) => {
      store.set(setTransientStatusHintAtom, {
        text: success ? COPY_LAST_RESPONSE_SUCCEEDED_HINT : COPY_LAST_RESPONSE_FAILED_HINT
      });
    })
    .catch(() => {
      store.set(setTransientStatusHintAtom, { text: COPY_LAST_RESPONSE_FAILED_HINT });
    });

  return true;
};
