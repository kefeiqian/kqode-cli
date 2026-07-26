import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import {
  PASTE_FAILED_HINT,
  RIGHT_CLICK_PASTE_DEDUP_MS,
  SELECTION_COPIED_HINT,
  SELECTION_COPY_FAILED_HINT
} from '@constants/ui.ts';
import {
  copySelection,
  handleRightClick
} from '@hooks/homeScreen/selectionClipboard.ts';
import { composerTarget } from '@hooks/promptComposer/pasteFromClipboard.ts';
import { PROMPT_MAX_BYTES } from '@libs/composer/promptText.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import {
  bodyEntriesAtom,
  bodySelectionAtom,
  columnsTestOverrideAtom,
  rowsTestOverrideAtom,
  shouldInsertBracketedPasteAtom,
  transientStatusHintAtom
} from '@state/ui/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function seededStore() {
  const store = createStore();
  store.set(columnsTestOverrideAtom, 80);
  store.set(rowsTestOverrideAtom, 24);
  store.set(bodyEntriesAtom, [{ kind: 'success', text: 'clipboard text' }]);
  store.set(bodySelectionAtom, {
    anchor: { rowIndex: 0, column: 0 },
    focus: { rowIndex: 0, column: 9 }
  });
  return store;
}

describe('selection clipboard actions', () => {
  it('surfaces a failed clipboard write', async () => {
    const store = seededStore();
    store.set(clipboardClientAtom, {
      readText: vi.fn(),
      writeText: vi.fn().mockResolvedValue(false)
    });

    expect(copySelection(store)).toBe(true);
    await flushPromises();

    expect(store.get(transientStatusHintAtom)?.text).toBe(SELECTION_COPY_FAILED_HINT);
  });

  it('keeps a failed copy fence only for the same-click native paste', async () => {
    vi.useFakeTimers();
    try {
      const store = seededStore();
      store.set(clipboardClientAtom, {
        readText: vi.fn(),
        writeText: vi.fn().mockResolvedValue(false)
      });

      handleRightClick(store, PROMPT_MAX_BYTES);
      await vi.advanceTimersByTimeAsync(0);

      expect(
        store.set(shouldInsertBracketedPasteAtom, {
          target: composerTarget(store)
        })
      ).toBe(false);
      expect(
        store.set(shouldInsertBracketedPasteAtom, {
          target: composerTarget(store)
        })
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a failed right-click clipboard read', async () => {
    vi.useFakeTimers();
    try {
      const store = seededStore();
      store.set(bodySelectionAtom, null);
      store.set(clipboardClientAtom, {
        readText: vi.fn().mockResolvedValue(null),
        writeText: vi.fn()
      });

      handleRightClick(store, PROMPT_MAX_BYTES);
      await vi.advanceTimersByTimeAsync(0);

      expect(store.get(transientStatusHintAtom)).toBeUndefined();

      await vi.advanceTimersByTimeAsync(RIGHT_CLICK_PASTE_DEDUP_MS);

      expect(store.get(transientStatusHintAtom)?.text).toBe(PASTE_FAILED_HINT);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts only one read for repeated right-clicks at the same target', async () => {
    const store = seededStore();
    store.set(bodySelectionAtom, null);
    let finishRead: (text: string) => void = () => undefined;
    const readText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishRead = resolve;
        })
    );
    store.set(clipboardClientAtom, { readText, writeText: vi.fn() });

    handleRightClick(store, PROMPT_MAX_BYTES);
    handleRightClick(store, PROMPT_MAX_BYTES);
    await flushPromises();

    expect(readText).toHaveBeenCalledTimes(1);

    finishRead('clipboard once');
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('clipboard once');
  });

  it('serializes a paste read after an earlier selection copy', async () => {
    const store = seededStore();
    let finishWrite: (success: boolean) => void = () => undefined;
    const writeText = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishWrite = resolve;
        })
    );
    const readText = vi.fn().mockResolvedValue('new clipboard');
    store.set(clipboardClientAtom, { readText, writeText });

    handleRightClick(store, PROMPT_MAX_BYTES);
    handleRightClick(store, PROMPT_MAX_BYTES);
    await flushPromises();

    expect(readText).not.toHaveBeenCalled();
    finishWrite(true);
    await flushPromises();
    await flushPromises();

    expect(readText).toHaveBeenCalledTimes(1);
    expect(store.get(composerStateAtom).text).toBe('new clipboard');
  });

  it('drops buffered native text when the authoritative read fails', async () => {
    vi.useFakeTimers();
    try {
      const store = seededStore();
      let finishWrite: (success: boolean) => void = () => undefined;
      const readText = vi.fn().mockResolvedValue(null);
      store.set(clipboardClientAtom, {
        readText,
        writeText: vi.fn(
          () =>
            new Promise<boolean>((resolve) => {
              finishWrite = resolve;
            })
        )
      });

      handleRightClick(store, PROMPT_MAX_BYTES);
      handleRightClick(store, PROMPT_MAX_BYTES);
      await vi.advanceTimersByTimeAsync(0);

      expect(
        store.set(shouldInsertBracketedPasteAtom, {
          target: composerTarget(store)
        })
      ).toBe(false);

      finishWrite(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(readText).toHaveBeenCalledTimes(1);
      expect(store.get(composerStateAtom).text).toBe('');
      expect(store.get(transientStatusHintAtom)?.text).toBe(SELECTION_COPIED_HINT);
      expect(
        store.set(shouldInsertBracketedPasteAtom, {
          target: composerTarget(store)
        })
      ).toBe(false);

      await vi.advanceTimersByTimeAsync(RIGHT_CLICK_PASTE_DEDUP_MS);

      expect(store.get(composerStateAtom).text).toBe('');
      expect(store.get(transientStatusHintAtom)?.text).toBe(PASTE_FAILED_HINT);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a late clipboard result after the composer target changes', async () => {
    const store = seededStore();
    store.set(bodySelectionAtom, null);
    let finishRead: (text: string) => void = () => undefined;
    store.set(clipboardClientAtom, {
      readText: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finishRead = resolve;
          })
      ),
      writeText: vi.fn()
    });

    handleRightClick(store, PROMPT_MAX_BYTES);
    store.set(composerStateAtom, {
      cursorIndex: 5,
      text: 'typed',
      validationError: null
    });
    finishRead('stale clipboard');
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('typed');
  });
});
