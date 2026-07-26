import { describe, expect, it, vi } from 'vitest';
import { clipboardClientAtom } from '@state/global/index.ts';
import {
  bodySelectionAtom,
  columnsTestOverrideAtom
} from '@state/ui/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderSelectionScreen } from '@test/renderSelectionScreen.tsx';
import {
  SgrMouseButton,
  sgrMouseInput
} from '@test/terminalInput.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('HomeScreen transcript selection', () => {
  it('highlights on drag, then copies and clears on right-click', async () => {
    const { stdin, store } = renderSelectionScreen();
    const writeText = vi.fn().mockResolvedValue(true);
    store.set(clipboardClientAtom, { readText: vi.fn(), writeText });
    await flushInput();

    // Header occupies SGR row 1, so the first transcript row is row 2.
    stdin.write(sgrMouseInput(SgrMouseButton.Left, 3, 2));
    stdin.write(sgrMouseInput(SgrMouseButton.LeftDrag, 13, 2));
    stdin.write(sgrMouseInput(SgrMouseButton.Left, 13, 2, 'm'));
    await flushInput();

    expect(store.get(bodySelectionAtom)).not.toBeNull();
    expect(writeText).not.toHaveBeenCalled();

    stdin.write(sgrMouseInput(SgrMouseButton.Right, 13, 2));
    await flushInput();
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith('selectable');
    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('does not select the rendered blank row below a short transcript', async () => {
    const { stdin, store } = renderSelectionScreen();
    await flushInput();

    stdin.write(sgrMouseInput(SgrMouseButton.Left, 3, 3));
    stdin.write(sgrMouseInput(SgrMouseButton.LeftDrag, 13, 3));
    stdin.write(sgrMouseInput(SgrMouseButton.Left, 13, 3, 'm'));
    await flushInput();

    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('clears a selection when resize changes transcript wrapping geometry', async () => {
    const { store } = renderSelectionScreen();
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 5 }
    });
    await flushInput();

    store.set(columnsTestOverrideAtom, 70);
    await flushInput();

    expect(store.get(bodySelectionAtom)).toBeNull();
  });

  it('clears a selection when the screen unmounts', async () => {
    const { store, unmount } = renderSelectionScreen();
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 5 }
    });
    await flushInput();

    unmount();

    expect(store.get(bodySelectionAtom)).toBeNull();
  });
});
