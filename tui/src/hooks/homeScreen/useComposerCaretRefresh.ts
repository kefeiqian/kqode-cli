import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { composerCaretRefreshTickAtom } from '@state/ui/composer/index.ts';

/**
 * Returns a callback that asks the composer to re-assert its current terminal
 * caret position after scroll repaints. Scrolling should not hide or move it.
 */
export function useComposerCaretRefresh(): () => void {
  const setRefreshTick = useSetAtom(composerCaretRefreshTickAtom);

  return useCallback(() => {
    setRefreshTick((current) => current + 1);
  }, [setRefreshTick]);
}
