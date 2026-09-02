import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { HelpScreen } from '@components/HelpScreen/index.tsx';
import { columnsTestOverrideAtom, rowsTestOverrideAtom } from '@state/ui/index.ts';
import { helpScrollOffsetAtom, helpVisibleAtom } from '@state/ui/help/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

function renderHelp({ columns = 100, rows = 12 }: { columns?: number; rows?: number } = {}) {
  const store = createStore();
  store.set(columnsTestOverrideAtom, columns);
  store.set(rowsTestOverrideAtom, rows);
  store.set(helpVisibleAtom, true);
  return { store, ...renderWithJotai(<HelpScreen />, store) };
}

describe('HelpScreen', () => {
  it('renders the command reference and the pager footer', () => {
    const { lastFrame } = renderHelp({ columns: 100, rows: 40 });
    const frame = lastFrame() ?? '';

    expect(frame).toContain('COMMANDS');
    expect(frame).toContain('/help');
    expect(frame).toContain('GLOBAL');
    expect(frame).toContain('↑/↓ scroll · q/esc close');
  });

  it('closes the viewer when Esc is pressed', async () => {
    const { store, stdin } = renderHelp();

    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(store.get(helpVisibleAtom)).toBe(false);
  });

  it('closes the viewer when q is pressed', async () => {
    const { store, stdin } = renderHelp();

    stdin.write('q');
    await flushInput();

    expect(store.get(helpVisibleAtom)).toBe(false);
  });

  it('scrolls down one row with the down arrow and back up with the up arrow', async () => {
    const { store, stdin } = renderHelp({ columns: 100, rows: 12 });
    expect(store.get(helpScrollOffsetAtom)).toBe(0);

    stdin.write('\u001B[B');
    await flushInput();
    expect(store.get(helpScrollOffsetAtom)).toBe(1);

    stdin.write('\u001B[A');
    await flushInput();
    expect(store.get(helpScrollOffsetAtom)).toBe(0);
  });

  it('does not scroll above the top', async () => {
    const { store, stdin } = renderHelp({ columns: 100, rows: 12 });

    stdin.write('\u001B[A');
    await flushInput();

    expect(store.get(helpScrollOffsetAtom)).toBe(0);
  });

  it('pages down with PageDown', async () => {
    const { store, stdin } = renderHelp({ columns: 100, rows: 12 });

    stdin.write('\u001B[6~');
    await flushInput();

    expect(store.get(helpScrollOffsetAtom)).toBeGreaterThan(1);
  });

  it('does not offer a scroll position indicator when everything fits', () => {
    const { lastFrame } = renderHelp({ columns: 100, rows: 60 });
    const frame = lastFrame() ?? '';

    expect(frame).toContain('↑/↓ scroll · q/esc close');
    expect(frame).not.toContain('more ↓');
    expect(frame).not.toMatch(/\btop\b/);
  });
});
