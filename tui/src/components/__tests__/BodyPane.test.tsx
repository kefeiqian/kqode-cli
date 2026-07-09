import { describe, expect, it } from 'vitest';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { BodyPane } from '@components/BodyPane.tsx';
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
});
