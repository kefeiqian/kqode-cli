import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { BodyPane } from '@components/BodyPane.tsx';
import { bodySelectionAtom, copyModeActiveAtom } from '@state/ui/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

describe('BodyPane', () => {
  it('strips decoded terminal control bytes from assistant segment text', () => {
    const { lastFrame } = renderWithJotai(
      <BodyPane
        columns={30}
        entries={[{ kind: BodyEntryKind.Assistant, text: `safe\u001b\u0007text` }]}
        rows={3}
      />
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('safetext');
    expect(frame).not.toContain('\u001b');
    expect(frame).not.toContain('\u0007');
  });

  it('keeps non-assistant wide text on the legacy single-text path', () => {
    const { lastFrame } = renderWithJotai(
      <BodyPane columns={8} entries={[{ kind: BodyEntryKind.Success, text: '你好' }]} rows={2} />
    );

    expect(lastFrame()).toContain('你好');
  });

  it('renders unsafe markdown links as visible non-clickable fallback text', () => {
    const { lastFrame } = renderWithJotai(
      <BodyPane
        columns={60}
        entries={[{ kind: BodyEntryKind.Assistant, text: '[x](javascript:alert(1))' }]}
        rows={3}
      />
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('x (javascript:alert(1))');
    expect(frame).not.toContain('\u001b]8');
  });

  it('preserves glyphs across the selection highlight split', () => {
    const store = createStore();
    store.set(copyModeActiveAtom, true);
    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 4 }
    });

    const { lastFrame } = renderWithJotai(
      <BodyPane
        columns={30}
        entries={[{ kind: BodyEntryKind.Success, text: 'highlighted line' }]}
        rows={3}
      />,
      store
    );

    expect(lastFrame()).toContain('highlighted line');
  });
});
