import { Text } from 'ink';
import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { useCommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { columnsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

function Probe(props: { panelRows: number; chromeWithGap: number; reservedContentRows?: number }) {
  const layout = useCommandSurfaceLayout(props);
  return <Text>{`${layout.bodyRows}|${String(layout.showFooterGap)}|${layout.columns}`}</Text>;
}

const makeStore = (columns: number): ReturnType<typeof createStore> => {
  const store = createStore();
  store.set(columnsTestOverrideAtom, columns);
  return store;
};

describe('useCommandSurfaceLayout', () => {
  it('derives the body-row budget and keeps the gap when a selectable row fits', () => {
    // panelRows 10 − chrome 4 = 6 body rows; safe width = 40 − 1.
    const { lastFrame } = renderWithJotai(<Probe panelRows={10} chromeWithGap={4} />, makeStore(40));
    expect(lastFrame()).toContain('6|true|39');
  });

  it('keeps the gap at the capped height while a selectable row still fits', () => {
    const { lastFrame } = renderWithJotai(<Probe panelRows={7} chromeWithGap={4} />, makeStore(40));
    expect(lastFrame()).toContain('3|true|39');
  });

  it('yields the gap and reclaims its row at the /memory hard cap', () => {
    // 7 − 6 − 1 = 0 < 1, so the gap yields: chrome drops to 5, body = 7 − 5 = 2.
    const { lastFrame } = renderWithJotai(
      <Probe panelRows={7} chromeWithGap={6} reservedContentRows={1} />,
      makeStore(40)
    );
    expect(lastFrame()).toContain('2|false|39');
  });
});
