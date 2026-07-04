import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { SlashCommandMenu } from '@components/SlashCommandMenu/index.tsx';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const makeStore = (text: string, columns = 80): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, 24);
  store.set(composerStateAtom, { text, cursorIndex: text.length, validationError: null });
  return store;
};

describe('SlashCommandMenu', () => {
  it('renders one row per command with the top highlighted', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/'));
    const frame = lastFrame() ?? '';

    expect(frame).toContain('/help');
    expect(frame).toContain('/clear');
    expect(frame).toContain('/exit');
    expect(frame).toContain('\u276F');
  });

  it('aligns descriptions into a column by padding command names', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/'));
    const lines = (lastFrame() ?? '').split('\n').filter((line) => line.includes('/'));

    // Each description must begin at the same column across every command row.
    const descriptionStarts = lines.map((line) => line.search(/(Clear|Exit|Show)/));

    expect(lines.length).toBe(3);
    expect(descriptionStarts.every((column) => column > 0 && column === descriptionStarts[0])).toBe(true);
  });

  it('shows a single no-matches row when nothing matches', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/zzz'));

    expect(lastFrame() ?? '').toContain('No matching commands');
  });

  it('renders nothing when the composer is not a command query', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('hello'));

    expect((lastFrame() ?? '').trim()).toBe('');
  });

  it('truncates rows to keep the terminal final column clear', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/', 20));

    for (const line of (lastFrame() ?? '').split('\n')) {
      expect(line.length).toBeLessThanOrEqual(19);
    }
  });
});
