import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { BodyPane } from '@components/BodyPane.tsx';
import { UPPER_HALF_BLOCK } from '@libs/tui/backgroundBlock.ts';
import { bodySelectionAtom } from '@state/ui/index.ts';
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

  it('pads full-width user prompt rows by display width so CJK text does not wrap padding', () => {
    const { lastFrame } = renderWithJotai(
      <BodyPane
        columns={60}
        entries={[
          { kind: BodyEntryKind.User, text: 'Hadamard 乘积什么时候用到?' },
          { kind: BodyEntryKind.Assistant, text: 'answer' }
        ]}
        rows={6}
      />
    );

    const rows = (lastFrame() ?? '').split('\n');
    expect(rows[1]).toContain('  ❯ Hadamard 乘积什么时候用到?');
    expect(rows[2]).toBe(UPPER_HALF_BLOCK.repeat(60));
    expect(rows[3]).toBe('• answer');
  });
});
