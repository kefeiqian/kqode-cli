import type { createStore } from 'jotai';
import { SELECTION_COPIED_HINT, SELECTION_COPY_FAILED_HINT } from '@constants/ui.ts';
import { selectedText } from '@libs/selection/selectedText.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import {
  bodySelectionAtom,
  setTransientStatusHintAtom,
  visibleBodyRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

/**
 * Reconstructs the active transcript selection as clean text and writes it to the
 * system clipboard through the injected seam, flashing a transient hint. Returns
 * `false` (a no-op) when there is no selection or the selection is empty, so the
 * caller can fall through to other handling.
 */
export function copySelection(store: Store): boolean {
  const selection = store.get(bodySelectionAtom);
  if (selection === null) {
    return false;
  }

  const text = selectedText(
    store.get(visibleBodyRowsAtom).allRows,
    selection.anchor,
    selection.focus
  );
  if (text.length === 0) {
    return false;
  }

  const clipboardClient = store.get(clipboardClientAtom);
  if (clipboardClient === undefined) {
    store.set(setTransientStatusHintAtom, { text: SELECTION_COPY_FAILED_HINT });
    return true;
  }

  void clipboardClient
    .writeText(text)
    .then((success) => {
      store.set(setTransientStatusHintAtom, {
        text: success ? SELECTION_COPIED_HINT : SELECTION_COPY_FAILED_HINT
      });
    })
    .catch(() => {
      store.set(setTransientStatusHintAtom, { text: SELECTION_COPY_FAILED_HINT });
    });

  return true;
}
