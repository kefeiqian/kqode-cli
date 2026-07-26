import { describe, expect, it, vi } from 'vitest';
import { clipboardClientAtom } from '@state/global/index.ts';
import { bodySelectionAtom } from '@state/ui/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderSelectionScreen } from '@test/renderSelectionScreen.tsx';
import {
  bracketedPasteInput,
  SgrMouseButton,
  sgrMouseInput
} from '@test/terminalInput.ts';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('HomeScreen right-click paste', () => {
  it('pastes once when no selection is active', async () => {
    const { stdin, store } = renderSelectionScreen();
    const readText = vi.fn().mockResolvedValue('from clipboard');
    store.set(clipboardClientAtom, { readText, writeText: vi.fn() });
    await flushInput();

    stdin.write(sgrMouseInput(SgrMouseButton.Right, 5, 14));
    await flushInput();
    await flushPromises();
    stdin.write(bracketedPasteInput('stale native clipboard'));
    await flushInput();

    expect(readText).toHaveBeenCalledTimes(1);
    expect(store.get(composerStateAtom).text).toBe('from clipboard');
  });

  it('uses native bracketed paste when the app clipboard read fails', async () => {
    const { stdin, store } = renderSelectionScreen();
    store.set(clipboardClientAtom, {
      readText: vi.fn().mockResolvedValue(null),
      writeText: vi.fn()
    });
    await flushInput();

    stdin.write(sgrMouseInput(SgrMouseButton.Right, 5, 14));
    await flushInput();
    await flushPromises();
    stdin.write(bracketedPasteInput('native fallback'));
    await flushInput();

    expect(store.get(composerStateAtom).text).toBe('native fallback');
  });

  it('expands pasted tabs so composer display columns stay stable', async () => {
    const { stdin, store } = renderSelectionScreen();
    await flushInput();

    stdin.write(bracketedPasteInput('a\tb'));
    await flushInput();

    expect(store.get(composerStateAtom)).toMatchObject({
      cursorIndex: 5,
      text: 'a   b'
    });
  });

  it('keeps only native paste when it wins the right-click race', async () => {
    const { stdin, store } = renderSelectionScreen();
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
    stdin.write(bracketedPasteInput('native first'));
    await flushInput();
    finishRead('app clipboard later');
    await flushPromises();

    expect(store.get(composerStateAtom).text).toBe('native first');
  });

  it('buffers stale native paste until a preceding copy finishes', async () => {
    const { stdin, store } = renderSelectionScreen();
    let finishWrite: (success: boolean) => void = () => undefined;
    const readText = vi.fn().mockResolvedValue('new clipboard');
    store.set(clipboardClientAtom, {
      readText,
      writeText: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishWrite = resolve;
          })
      )
    });
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 9 }
    });
    await flushInput();

    stdin.write(sgrMouseInput(SgrMouseButton.Right, 5, 14));
    stdin.write(sgrMouseInput(SgrMouseButton.Right, 5, 14));
    await flushInput();

    expect(readText).not.toHaveBeenCalled();

    stdin.write(bracketedPasteInput('old clipboard'));
    await flushInput();

    expect(store.get(composerStateAtom).text).toBe('');

    finishWrite(true);
    await flushPromises();
    await flushPromises();

    expect(readText).toHaveBeenCalledTimes(1);
    expect(store.get(composerStateAtom).text).toBe('new clipboard');
  });

  it('cancels a pending read when keyboard input resumes', async () => {
    const { stdin, store } = renderSelectionScreen();
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
    stdin.write('z');
    await flushInput();
    finishRead('stale clipboard');
    await flushPromises();
    stdin.write(bracketedPasteInput('late native clipboard'));
    await flushInput();

    expect(store.get(composerStateAtom).text).toBe('z');
  });
});
