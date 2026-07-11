import { createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushInput } from '@test/flushInput.ts';

describe('HomeScreen mouse tracking', () => {
  afterEach(() => {
    vi.doUnmock('ink');
    vi.resetModules();
  });

  // Re-imports the module graph via resetModules (below), which is slow under
  // parallel-load contention (e.g. concurrent Rust backend builds), so allow
  // headroom beyond vitest's 5s default. The assertion itself is fast.
  it('writes no mouse tracking sequences when stdout is not a TTY', async () => {
    const stdout = {
      isTTY: false,
      write: vi.fn()
    } as unknown as NodeJS.WriteStream;

    vi.resetModules();
    vi.doMock('ink', async (importOriginal) => {
      const actual = await importOriginal<typeof import('ink')>();
      return {
        ...actual,
        useStdout: () => ({ stdout })
      };
    });

    const [{ HomeScreenView }, { renderWithJotai }, uiState] = await Promise.all([
      import('@components/HomeScreen/HomeScreenView.tsx'),
      import('@test/renderWithJotai.tsx'),
      import('@state/ui/index.ts')
    ]);
    const store = createStore();
    store.set(uiState.columnsTestOverrideAtom, 100);
    store.set(uiState.rowsTestOverrideAtom, 15);

    const { unmount } = renderWithJotai(<HomeScreenView />, store);
    await flushInput();
    store.set(uiState.copyModeActiveAtom, true);
    await flushInput();
    unmount();

    expect(stdout.write).not.toHaveBeenCalled();
  }, 15_000);
});
