import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { columnsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const makeStore = (columns: number): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, columns);
  return store;
};

const firstLine = (frame: string | undefined): string => (frame ?? '').split('\n')[0] ?? '';

describe('SelectableRow', () => {
  it('marks the highlighted row with a chevron gutter at column 0', () => {
    const { lastFrame } = renderWithJotai(<SelectableRow highlighted content="alpha" />, makeStore(40));
    const line = firstLine(lastFrame());

    expect(line).toContain('\u276F alpha');
    expect(line.indexOf('\u276F')).toBe(0);
  });

  it('renders a blank two-column gutter and no chevron when not highlighted', () => {
    const { lastFrame } = renderWithJotai(
      <SelectableRow highlighted={false} content="alpha" />,
      makeStore(40)
    );
    const line = firstLine(lastFrame());

    expect(line).not.toContain('\u276F');
    // The plain gutter keeps content aligned at the same column as a chevron row.
    expect(line.indexOf('alpha')).toBe(2);
  });

  it('clips content that exceeds the safe chrome width', () => {
    // Safe width = 20 - 1 = 19; gutter(2) leaves room for 17 content columns.
    const { lastFrame } = renderWithJotai(
      <SelectableRow highlighted={false} content={'x'.repeat(100)} />,
      makeStore(20)
    );
    const line = firstLine(lastFrame());

    expect(line).not.toContain('\u276F');
    expect((line.match(/x/g) ?? []).length).toBe(17);
  });
});
