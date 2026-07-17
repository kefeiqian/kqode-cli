import { createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { composerCaretRefreshTickAtom } from '@state/ui/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
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

    const { unmount } = renderWithJotai(<PromptComposer />, store);
    await flushInput();
    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toBeDefined();
    });
    const initialPosition = setCursorPositionSpy.mock.calls.at(-1)?.[0];
    setCursorPositionSpy.mockClear();

    store.set(composerCaretRefreshTickAtom, 1);

    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toEqual(initialPosition);
    });

    unmount();
  });
});
