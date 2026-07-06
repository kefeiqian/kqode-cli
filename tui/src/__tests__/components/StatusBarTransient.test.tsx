import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { StatusBar } from '@components/StatusBar.tsx';
import {
  BACKEND_LOADING_HINT,
  columnsTestOverrideAtom,
  setTransientStatusHintAtom,
  startupStatusHintAtom,
  transientStatusHintAtom,
  WORKING_STATUS_HINT
} from '@state/ui/index.ts';
import { promptQueueAtom } from '@state/promptQueue/index.ts';
import { DEFAULT_STATUS_HINTS, TRANSIENT_STATUS_HINT_MS } from '@constants/ui.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const makeStore = (): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, 80);
  return store;
};

describe('StatusBar transient hints', () => {
  it('shows then clears a transient hint', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set(setTransientStatusHintAtom, { text: 'copied' });

    const { lastFrame, unmount } = renderWithJotai(<StatusBar />, store);
    expect(lastFrame() ?? '').toContain('copied');

    await vi.advanceTimersByTimeAsync(TRANSIENT_STATUS_HINT_MS);

    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain(DEFAULT_STATUS_HINTS);
      expect(store.get(transientStatusHintAtom)).toBeUndefined();
    });
    unmount();
    vi.useRealTimers();
  });

  it('keeps loading hint ahead of transient hints', () => {
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
    store.set(setTransientStatusHintAtom, { text: 'copied' });

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    expect(lastFrame() ?? '').toContain(BACKEND_LOADING_HINT.text);
    expect(lastFrame() ?? '').not.toContain('copied');
  });

  it('restarts the clear timer when a newer transient hint replaces the first', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.set(setTransientStatusHintAtom, { text: 'first' });

    const { lastFrame, unmount } = renderWithJotai(<StatusBar />, store);
    expect(lastFrame() ?? '').toContain('first');

    await vi.advanceTimersByTimeAsync(TRANSIENT_STATUS_HINT_MS - 1);
    store.set(setTransientStatusHintAtom, { text: 'second' });
    await vi.advanceTimersByTimeAsync(0);
    expect(lastFrame() ?? '').toContain('second');

    await vi.advanceTimersByTimeAsync(1);
    expect(lastFrame() ?? '').toContain('second');
    await vi.advanceTimersByTimeAsync(TRANSIENT_STATUS_HINT_MS);

    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain(DEFAULT_STATUS_HINTS);
    });
    unmount();
    vi.useRealTimers();
  });
});

describe('StatusBar working hint', () => {
  it('shows the working hint while a turn is in flight', () => {
    const store = makeStore();
    store.set(promptQueueAtom, [{ id: 0, turnId: 't1', text: 'hi', state: 'active' }]);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    expect(lastFrame() ?? '').toContain(WORKING_STATUS_HINT.text);
  });

  it('drops the working hint once every turn settles', () => {
    const store = makeStore();
    store.set(promptQueueAtom, [{ id: 0, turnId: 't1', text: 'hi', state: 'settled' }]);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    expect(lastFrame() ?? '').not.toContain(WORKING_STATUS_HINT.text);
    expect(lastFrame() ?? '').toContain(DEFAULT_STATUS_HINTS);
  });

  it('keeps the backend loading hint ahead of the working hint', () => {
    const store = makeStore();
    store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
    store.set(promptQueueAtom, [{ id: 0, turnId: 't1', text: 'hi', state: 'active' }]);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);

    expect(lastFrame() ?? '').toContain(BACKEND_LOADING_HINT.text);
    expect(lastFrame() ?? '').not.toContain(WORKING_STATUS_HINT.text);
  });
});
