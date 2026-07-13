import { createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { HIDE_CURSOR_SEQUENCE } from '@libs/terminal/cursorVisibility.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { caretSuppressedWhileScrollingAtom } from '@state/ui/composer/index.ts';
import {
  BACKEND_LOADING_HINT,
  gitStatusLabelAtom,
  loadingFrameAtom,
  startupStatusHintAtom
} from '@state/ui/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

// The composer owns the terminal caret via Ink's useCursor. Capture every
// setCursorPosition call, and the stdout writes its cursor-visibility hook makes,
// so the tests can assert the caret is hidden while input is locked (backend
// loading), shown once ready, and re-asserted whenever the surrounding chrome
// repaints (Ink drops the caret on any frame the composer does not re-render).
const { setCursorPositionSpy, stdoutWriteSpy, fakeStdout } = vi.hoisted(() => {
  const stdoutWriteSpy = vi.fn();
  return {
    setCursorPositionSpy: vi.fn(),
    stdoutWriteSpy,
    fakeStdout: { isTTY: true, write: stdoutWriteSpy }
  };
});

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    useCursor: () => ({ setCursorPosition: setCursorPositionSpy }),
    useStdout: () => ({ stdout: fakeStdout })
  };
});

function makeStore(): ReturnType<typeof createStore> {
  const store = createStore();
  store.set(columnsTestOverrideAtom, 60);
  store.set(rowsTestOverrideAtom, 24);
  return store;
}

function everyCursorCallUndefined(): boolean {
  return setCursorPositionSpy.mock.calls.every((call) => call[0] === undefined);
}

describe('PromptComposer caret while input is locked (backend loading)', () => {
  beforeEach(() => {
    setCursorPositionSpy.mockClear();
    stdoutWriteSpy.mockClear();
  });

  it('sets no caret position and explicitly hides the terminal cursor', async () => {
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);

    const { unmount } = renderWithJotai(<PromptComposer />, store);
    await flushInput();

    expect(setCursorPositionSpy.mock.calls.length).toBeGreaterThan(0);
    expect(everyCursorCallUndefined()).toBe(true);
    // Ink only hides a cursor that was previously shown, so during loading the
    // composer hides the hardware cursor itself.
    await vi.waitFor(() => {
      expect(stdoutWriteSpy).toHaveBeenCalledWith(HIDE_CURSOR_SEQUENCE);
    });

    unmount();
  });

  it('keeps the cursor hidden and re-hidden across spinner frames', async () => {
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);

    const { unmount } = renderWithJotai(<PromptComposer />, store);
    await flushInput();
    await vi.waitFor(() => {
      expect(stdoutWriteSpy).toHaveBeenCalledWith(HIDE_CURSOR_SEQUENCE);
    });
    setCursorPositionSpy.mockClear();
    stdoutWriteSpy.mockClear();

    // A loading-spinner tick re-renders the composer; the caret must stay unset
    // and the hardware cursor must be re-hidden so a repaint cannot re-expose it.
    store.set(loadingFrameAtom, 1);

    await vi.waitFor(() => {
      expect(stdoutWriteSpy).toHaveBeenCalledWith(HIDE_CURSOR_SEQUENCE);
    });
    expect(everyCursorCallUndefined()).toBe(true);

    unmount();
  });
});

describe('PromptComposer caret while body scrolling is active', () => {
  beforeEach(() => {
    setCursorPositionSpy.mockClear();
    stdoutWriteSpy.mockClear();
  });

  it('sets no caret position and explicitly hides the terminal cursor', async () => {
    const store = makeStore();
    store.set(caretSuppressedWhileScrollingAtom, true);

    const { unmount } = renderWithJotai(<PromptComposer />, store);
    await flushInput();

    expect(setCursorPositionSpy.mock.calls.length).toBeGreaterThan(0);
    expect(everyCursorCallUndefined()).toBe(true);
    await vi.waitFor(() => {
      expect(stdoutWriteSpy).toHaveBeenCalledWith(HIDE_CURSOR_SEQUENCE);
    });

    unmount();
  });
});

describe('PromptComposer caret once input is unlocked (ready)', () => {
  beforeEach(() => {
    setCursorPositionSpy.mockClear();
    stdoutWriteSpy.mockClear();
  });

  it('shows the caret once the backend finishes loading', async () => {
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);

    const { unmount } = renderWithJotai(<PromptComposer />, store);
    await flushInput();
    expect(everyCursorCallUndefined()).toBe(true);

    // Backend ready → input unlocks → the caret returns to the prompt.
    store.set(startupStatusHintAtom, undefined);

    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toBeDefined();
    });

    unmount();
  });

  it('re-asserts the caret when the git status label arrives after unlock', async () => {
    const store = makeStore();

    const { unmount } = renderWithJotai(<PromptComposer />, store);
    await flushInput();
    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toBeDefined();
    });
    const callsBeforeGitStatus = setCursorPositionSpy.mock.calls.length;

    // The git status resolves asynchronously and repaints the cwd row on the same
    // line (no row-count change, so layoutAtom does not change). The composer must
    // still re-render and re-assert the caret, or the cursor disappears once the
    // git status lands.
    store.set(gitStatusLabelAtom, 'main +2 -1');

    await vi.waitFor(() => {
      expect(setCursorPositionSpy.mock.calls.length).toBeGreaterThan(callsBeforeGitStatus);
    });
    expect(setCursorPositionSpy.mock.calls.at(-1)?.[0]).toBeDefined();

    unmount();
  });
});
