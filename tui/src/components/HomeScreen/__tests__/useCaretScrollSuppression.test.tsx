import { Box } from 'ink';
import { createStore } from 'jotai';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { useCaretScrollSuppression } from '@components/HomeScreen/useCaretScrollSuppression.ts';
import { caretSuppressedWhileScrollingAtom } from '@state/ui/composer/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

function ScrollProbe() {
  const notifyScroll = useCaretScrollSuppression(10_000);

  useEffect(() => {
    notifyScroll();
  }, [notifyScroll]);

  return <Box />;
}

describe('useCaretScrollSuppression', () => {
  it('clears suppression when HomeScreen unmounts during the settle window', async () => {
    const store = createStore();
    const screen = renderWithJotai(<ScrollProbe />, store);
    await Promise.resolve();

    expect(store.get(caretSuppressedWhileScrollingAtom)).toBe(true);

    screen.unmount();

    expect(store.get(caretSuppressedWhileScrollingAtom)).toBe(false);
  });
});
