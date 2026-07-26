import { describe, expect, it, vi } from 'vitest';
import {
  PASTE_FAILED_HINT,
  RIGHT_CLICK_PASTE_DEDUP_MS
} from '@constants/ui.ts';
import { composerTarget } from '@hooks/promptComposer/pasteFromClipboard.ts';
import { clipboardClientAtom } from '@state/global/index.ts';
import {
  shouldInsertBracketedPasteAtom,
  transientStatusHintAtom
} from '@state/ui/index.ts';
import { rightClickPasteStateAtom } from '@state/ui/pasteState.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderSelectionScreen } from '@test/renderSelectionScreen.tsx';
import {
  SgrMouseButton,
  sgrMouseInput
} from '@test/terminalInput.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('HomeScreen paste lifecycle cleanup', () => {
  it('suppresses pending app and native paste after unmount', async () => {
    const { stdin, store, unmount } = renderSelectionScreen();
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
    await flushInput();

    stdin.write(sgrMouseInput(SgrMouseButton.Right, 5, 14));
    await flushInput();
    unmount();

    expect(store.get(rightClickPasteStateAtom)).toMatchObject({
      kind: 'paste',
      status: 'cancelled'
    });

    finishRead('late app clipboard');
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('');
    expect(
      store.set(shouldInsertBracketedPasteAtom, {
        target: composerTarget(store)
      })
    ).toBe(false);
  });

  it('does not show a delayed paste failure after unmount', async () => {
    const { stdin, store, unmount } = renderSelectionScreen();
    store.set(clipboardClientAtom, {
      readText: vi.fn().mockResolvedValue(null),
      writeText: vi.fn()
    });
    await flushInput();

    stdin.write(sgrMouseInput(SgrMouseButton.Right, 5, 14));
    await flushInput();
    await flushPromises();
    unmount();
    await new Promise((resolve) =>
      setTimeout(resolve, RIGHT_CLICK_PASTE_DEDUP_MS + 10)
    );

    expect(store.get(transientStatusHintAtom)?.text).not.toBe(PASTE_FAILED_HINT);
  });
});
