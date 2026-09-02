import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { SELECTION_COPIED_HINT, SELECTION_COPY_FAILED_HINT } from '@constants/ui.ts';
import { copySelection } from '@components/HomeScreen/copySelection.ts';
import { handleRightClick } from '@components/HomeScreen/useHomeScreenInput.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import {
  activeSurfaceAtom,
  bodyEntriesAtom,
  bodySelectionAtom,
  columnsTestOverrideAtom,
  rowsTestOverrideAtom,
  Surface,
  transientStatusHintAtom,
  visibleBodyRowsAtom
} from '@state/ui/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function seedTranscript(store: ReturnType<typeof createStore>) {
  store.set(columnsTestOverrideAtom, 80);
  store.set(rowsTestOverrideAtom, 24);
  store.set(bodyEntriesAtom, [{ kind: BodyEntryKind.Success, text: 'clipboardtext' }]);
  const { allRows } = store.get(visibleBodyRowsAtom);
  store.set(bodySelectionAtom, {
    anchor: { rowIndex: 0, column: 0 },
    focus: { rowIndex: Math.max(0, allRows.length - 1), column: 999 }
  });
}

describe('copySelection', () => {
  it('writes the reconstructed selection and shows the copied hint', async () => {
    const store = createStore();
    seedTranscript(store);
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });

    expect(copySelection(store)).toBe(true);
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('clipboardtext'));
    expect(store.get(transientStatusHintAtom)?.text).toBe(SELECTION_COPIED_HINT);
  });

  it('does nothing when there is no active selection', () => {
    const store = createStore();
    seedTranscript(store);
    store.set(bodySelectionAtom, null);
    const writeText = vi.fn();
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });

    expect(copySelection(store)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does nothing for a collapsed (empty) selection', () => {
    const store = createStore();
    seedTranscript(store);
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 2 },
      focus: { rowIndex: 0, column: 2 }
    });
    const writeText = vi.fn();
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });

    expect(copySelection(store)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('shows the failed hint when the clipboard write returns false', async () => {
    const store = createStore();
    seedTranscript(store);
    store.set(clipboardClientAtom, {
      readText: vi.fn(),
      writeText: vi.fn().mockResolvedValue(false)
    });

    expect(copySelection(store)).toBe(true);
    await flushPromises();

    expect(store.get(transientStatusHintAtom)?.text).toBe(SELECTION_COPY_FAILED_HINT);
  });

  it('shows the failed hint when no clipboard client is available', () => {
    const store = createStore();
    seedTranscript(store);

    expect(copySelection(store)).toBe(true);
    expect(store.get(transientStatusHintAtom)?.text).toBe(SELECTION_COPY_FAILED_HINT);
  });
});

describe('handleRightClick', () => {
  it('pastes into the composer when no docked panel is active', async () => {
    const store = createStore();
    seedTranscript(store);
    store.set(bodySelectionAtom, null);
    store.set(clipboardClientAtom, {
      readText: vi.fn(async () => 'from clipboard'),
      writeText: vi.fn()
    });

    handleRightClick(store);
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('from clipboard');
  });

  it('does not paste into the hidden composer while a docked panel is active', async () => {
    const store = createStore();
    seedTranscript(store);
    store.set(activeSurfaceAtom, Surface.Memory);
    store.set(bodySelectionAtom, null);
    const readText = vi.fn(async () => 'from clipboard');
    store.set(clipboardClientAtom, { readText, writeText: vi.fn() });

    handleRightClick(store);
    await flushPromises();

    expect(readText).not.toHaveBeenCalled();
    expect(store.get(composerStateAtom).text).toBe('');
  });
});
