import { createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeScreenView } from '@components/HomeScreen/HomeScreenView.tsx';
import {
  composerCaretRefreshTickAtom,
  composerStateAtom
} from '@state/ui/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { bodyEntriesAtom } from '@state/ui/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const { composerFrameSpy, setCursorPositionSpy } = vi.hoisted(() => ({
  composerFrameSpy: vi.fn(),
  setCursorPositionSpy: vi.fn()
}));

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    useCursor: () => ({ setCursorPosition: setCursorPositionSpy })
  };
});

vi.mock('@components/PromptComposer/ComposerFrame.tsx', async () => {
  const actual = await vi.importActual<
    typeof import('@components/PromptComposer/ComposerFrame.tsx')
  >('@components/PromptComposer/ComposerFrame.tsx');
  return {
    ...actual,
    ComposerFrame: (
      props: Parameters<typeof actual.ComposerFrame>[0]
    ) => {
      composerFrameSpy();
      return actual.ComposerFrame(props);
    }
  };
});

describe('PromptComposer caret during scrolling', () => {
  beforeEach(() => {
    composerFrameSpy.mockClear();
    setCursorPositionSpy.mockClear();
  });

  it('re-asserts the caret after a scroll repaint without re-rendering the frame', async () => {
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
    composerFrameSpy.mockClear();
    setCursorPositionSpy.mockClear();

    stdin.write('\u001B[5~');
    await flushInput();

    expect(store.get(composerCaretRefreshTickAtom)).toBe(1);
    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toEqual(initialPosition);
    });
    expect(composerFrameSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('places a soft-wrap boundary caret at the next row start', async () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 60);
    store.set(rowsTestOverrideAtom, 24);
    const text = 'a'.repeat(116);
    store.set(composerStateAtom, { text, cursorIndex: 0, validationError: null });

    const { unmount } = renderWithJotai(<HomeScreenView />, store);
    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toBeDefined();
    });
    const firstRowPosition = setCursorPositionSpy.mock.calls.at(-1)?.[0];

    store.set(composerStateAtom, { text, cursorIndex: 58, validationError: null });

    await vi.waitFor(() => {
      const boundaryPosition = setCursorPositionSpy.mock.calls.at(-1)?.[0];
      expect(boundaryPosition).toEqual({
        x: firstRowPosition.x,
        y: firstRowPosition.y + 1
      });
    });

    unmount();
  });
});
