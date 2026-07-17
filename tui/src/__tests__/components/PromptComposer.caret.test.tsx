import { createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeScreenView } from '@components/HomeScreen/HomeScreenView.tsx';
import { composerCaretRefreshTickAtom } from '@state/ui/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { bodyEntriesAtom } from '@state/ui/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const { setCursorPositionSpy } = vi.hoisted(() => ({
  setCursorPositionSpy: vi.fn()
}));

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    useCursor: () => ({ setCursorPosition: setCursorPositionSpy })
  };
});

describe('PromptComposer caret during scrolling', () => {
  beforeEach(() => {
    setCursorPositionSpy.mockClear();
  });

  it('keeps the caret visible and re-asserts its position after a scroll repaint', async () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 60);
    store.set(rowsTestOverrideAtom, 24);
    store.set(
      bodyEntriesAtom,
      Array.from({ length: 20 }, (_, index) => ({
        kind: 'assistant' as const,
        text: `entry ${index + 1}`
      }))
    );

    const { stdin, unmount } = renderWithJotai(<HomeScreenView />, store);
    await flushInput();
    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toBeDefined();
    });
    const initialPosition = setCursorPositionSpy.mock.calls.at(-1)?.[0];
    setCursorPositionSpy.mockClear();

    stdin.write('\u001B[5~');
    await flushInput();

    expect(store.get(composerCaretRefreshTickAtom)).toBe(1);
    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toEqual(initialPosition);
    });

    unmount();
  });
});
