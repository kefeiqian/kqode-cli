import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { DockDivider } from '@components/DockDivider.tsx';
import { columnsTestOverrideAtom } from '@state/ui/dimensions.ts';
import { safeChromeColumnsAtom } from '@state/ui/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

describe('DockDivider', () => {
  it('renders a full-width rule at the safe content width', () => {
    const store = createStore();
    store.set(columnsTestOverrideAtom, 40);
    const width = store.get(safeChromeColumnsAtom);

    const { lastFrame } = renderWithJotai(<DockDivider />, store);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('─'.repeat(width));
    expect(frame).not.toContain('─'.repeat(width + 1));
  });
});
