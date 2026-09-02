import { Text } from 'ink';
import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { CommandSurface } from '@components/CommandSurface/index.tsx';
import type { CommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { columnsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const makeStore = (columns: number): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, columns);
  return store;
};

const layout = (over: Partial<CommandSurfaceLayout> = {}): CommandSurfaceLayout => ({
  bodyRows: 1,
  showFooterGap: true,
  columns: 39,
  ...over
});

const lines = (frame: string | undefined): string[] => (frame ?? '').split('\n');

describe('CommandSurface', () => {
  it('renders divider, label, body, and footer in order', () => {
    const { lastFrame } = renderWithJotai(
      <CommandSurface panelRows={5} layout={layout()} label="/x" bodyRows={1} footerHint="pick one" position="">
        <Text>BODYLINE</Text>
      </CommandSurface>,
      makeStore(40)
    );
    const rows = lines(lastFrame());

    expect(rows[0]).toContain('─');
    expect(rows[1]).toBe('/x');
    const body = rows.findIndex((line) => line.includes('BODYLINE'));
    const footer = rows.findIndex((line) => line.includes('pick one'));
    expect(body).toBeGreaterThan(1);
    expect(footer).toBeGreaterThan(body);
  });

  it('renders the header row between the label and the body', () => {
    const { lastFrame } = renderWithJotai(
      <CommandSurface
        panelRows={6}
        layout={layout()}
        label="/x"
        header={<Text>HEADERROW</Text>}
        bodyRows={1}
        footerHint="hint"
        position=""
      >
        <Text>BODYLINE</Text>
      </CommandSurface>,
      makeStore(40)
    );
    const rows = lines(lastFrame());
    const header = rows.findIndex((line) => line.includes('HEADERROW'));
    const body = rows.findIndex((line) => line.includes('BODYLINE'));

    expect(rows[1]).toBe('/x');
    expect(header).toBe(2);
    expect(body).toBeGreaterThan(header);
  });

  it('adds a blank gap row above the footer when showFooterGap is true, and drops it when false', () => {
    const withGap = renderWithJotai(
      <CommandSurface panelRows={5} layout={layout({ showFooterGap: true })} label="/x" bodyRows={1} footerHint="hint" position="">
        <Text>BODYLINE</Text>
      </CommandSurface>,
      makeStore(40)
    );
    const noGap = renderWithJotai(
      <CommandSurface panelRows={5} layout={layout({ showFooterGap: false })} label="/x" bodyRows={1} footerHint="hint" position="">
        <Text>BODYLINE</Text>
      </CommandSurface>,
      makeStore(40)
    );

    const gapRows = lines(withGap.lastFrame());
    const tightRows = lines(noGap.lastFrame());
    const gapDelta = gapRows.findIndex((l) => l.includes('hint')) - gapRows.findIndex((l) => l.includes('BODYLINE'));
    const tightDelta = tightRows.findIndex((l) => l.includes('hint')) - tightRows.findIndex((l) => l.includes('BODYLINE'));

    expect(gapDelta).toBe(2); // body, blank gap, footer
    expect(tightDelta).toBe(1); // body, footer
  });

  it('right-aligns the scroll indicator and truncates a long hint to fit beside it', () => {
    const { lastFrame } = renderWithJotai(
      <CommandSurface
        panelRows={5}
        layout={layout()}
        label="/x"
        bodyRows={1}
        footerHint={'x'.repeat(60)}
        position="more ↑↓"
      >
        <Text>BODYLINE</Text>
      </CommandSurface>,
      makeStore(40)
    );
    const footer = lines(lastFrame()).find((line) => line.includes('more ↑↓')) ?? '';

    expect(footer).toContain('more ↑↓');
    // hintWidth = columns(39) − position.length(7) − 1 = 31, so the hint truncates.
    expect((footer.match(/x/g) ?? []).length).toBeLessThanOrEqual(31);
  });
});
