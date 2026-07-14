import { useCallback, useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { caretSuppressedWhileScrollingAtom } from '@state/ui/composer/index.ts';
import { CARET_SCROLL_SETTLE_MS } from '@constants/ui.ts';

/**
 * Returns a `notifyScroll` callback that suppresses the composer caret while the
 * user is actively scrolling and clears the suppression `settleMs` after the
 * last scroll. This hides the caret during a scroll gesture and re-shows it
 * (blinking steadily) once scrolling settles, instead of resetting the terminal
 * cursor's blink on every scrolled frame.
 */
export function useCaretScrollSuppression(settleMs: number = CARET_SCROLL_SETTLE_MS): () => void {
  const setSuppressed = useSetAtom(caretSuppressedWhileScrollingAtom);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      setSuppressed(false);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    },
    [setSuppressed]
  );

  return useCallback(() => {
    setSuppressed(true);
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setSuppressed(false);
      timeoutRef.current = null;
    }, settleMs);
  }, [setSuppressed, settleMs]);
}
