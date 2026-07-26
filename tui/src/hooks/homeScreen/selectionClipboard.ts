import type { createStore } from 'jotai';
import {
  SELECTION_COPIED_HINT,
  SELECTION_COPY_FAILED_HINT
} from '@constants/ui.ts';
import {
  composerTarget,
  pasteFromClipboard
} from '@hooks/promptComposer/pasteFromClipboard.ts';
import { selectedText } from '@libs/selection/selectedText.ts';
import {
  clipboardWritePendingAtom,
  writeClipboardAtom
} from '@state/global/index.ts';
import {
  beginRightClickCopyAtom,
  beginRightClickPasteAtom,
  bodySelectionAtom,
  clearBodySelectionAtom,
  setTransientStatusHintAtom,
  visibleBodyRowsAtom
} from '@state/ui/index.ts';

type Store = ReturnType<typeof createStore>;

/** Copies the active non-empty selection and reports whether copy was attempted. */
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

  void store
    .set(writeClipboardAtom, text)
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

/** Copies and clears a selection, or pastes when no non-empty selection exists. */
export function handleRightClick(store: Store, maxBytes: number): void {
  if (copySelection(store)) {
    store.set(beginRightClickCopyAtom);
  } else {
    const target = composerTarget(store);
    const { operationId, started } = store.set(beginRightClickPasteAtom, {
      bufferNative: store.get(clipboardWritePendingAtom),
      target
    });
    if (started) {
      pasteFromClipboard(store, maxBytes, { operationId });
    }
  }
  store.set(clearBodySelectionAtom);
}
