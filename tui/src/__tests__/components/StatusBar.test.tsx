import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { StatusBar } from '@components/StatusBar.tsx';
import { armedActionAtom, columnsTestOverrideAtom } from '@state/ui/index.ts';
import { ArmedAction } from '@constants/ui.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const makeStore = (): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, 80);
  return store;
};

describe('StatusBar', () => {
  it('shows the default hints when nothing is armed', () => {
    const { lastFrame } = renderWithJotai(<StatusBar />, makeStore());
    expect(lastFrame() ?? '').toContain('/ commands');
  });

  it('shows the clear-input hint while Esc is armed', () => {
    const store = makeStore();
    store.set(armedActionAtom, ArmedAction.ClearInput);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);
    expect(lastFrame() ?? '').toContain('esc again to clear input');
  });

  it('shows the exit hint while Ctrl+C is armed', () => {
    const store = makeStore();
    store.set(armedActionAtom, ArmedAction.Exit);

    const { lastFrame } = renderWithJotai(<StatusBar />, store);
    expect(lastFrame() ?? '').toContain('ctrl+c again to exit');
  });

  it('keeps the model label out of the terminal final column', () => {
    const { lastFrame } = renderWithJotai(<StatusBar />, makeStore());
    const line = (lastFrame() ?? '').split('\n')[0] ?? '';

    expect(line).toHaveLength(79);
    expect(line.endsWith('GPT-5.5')).toBe(true);
  });
});
