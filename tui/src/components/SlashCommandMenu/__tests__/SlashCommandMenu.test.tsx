import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { SlashCommandMenu } from '@components/SlashCommandMenu/index.tsx';
import { COMMAND_MENU_PANEL_ROWS } from '@constants/ui.ts';
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
    expect(frame).toContain('/resume');
    expect(frame).toContain('\u276F');
  });

  it('aligns descriptions into a column by padding command names', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/'));
    const lines = (lastFrame() ?? '').split('\n').filter((line) => line.includes('/'));

    // Each description must begin at the same column across every command row.
    const descriptionStarts = lines.map((line) => line.search(/(Choose|Clear|Connect|Exit|Manage|Resume|Show)/));

    expect(lines.length).toBe(7);
    expect(descriptionStarts.every((column) => column > 0 && column === descriptionStarts[0])).toBe(true);
  });

  it('renders filtered memory subcommands with descriptions', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/memory'));
    const frame = lastFrame() ?? '';

    expect(frame).toContain('/memory add');
    expect(frame).toContain('Add a project memory');
    expect(frame).toContain('/memory inbox');
  });

  it('narrows memory subcommands by typed prefix', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/memory e'));
    const frame = lastFrame() ?? '';

    expect(frame).toContain('/memory edit');
    expect(frame).not.toContain('/memory add');
  });

  it('shows a single no-matches row when nothing matches', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/zzz'));

    expect(lastFrame() ?? '').toContain('No matching commands');
  });

  it('renders nothing when the composer is not a command query', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('hello'));

    expect((lastFrame() ?? '').trim()).toBe('');
  });

  it('keeps a fixed panel height by padding blank rows below a narrowed match', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/mo'));
    const lines = (lastFrame() ?? '').split('\n');

    // Only `/model` matches, but the panel keeps its fixed height so the
    // composer below never shifts as the query narrows.
    // Row 0 is the accent top rule (U5); the sole match sits on row 1.
    expect(lines.length).toBe(COMMAND_MENU_PANEL_ROWS + 1);
    expect(lines[1]).toContain('/model');
    expect(lines[1]).toContain('\u276F');
    for (const line of lines.slice(2)) {
      expect(line.trim()).toBe('');
    }
  });

  it('truncates rows to the shared safe chrome width', () => {
    const { lastFrame } = renderWithJotai(<SlashCommandMenu />, makeStore('/', 20));

    for (const line of (lastFrame() ?? '').split('\n')) {
      expect(line.length).toBeLessThanOrEqual(19);
    }
  });
});
