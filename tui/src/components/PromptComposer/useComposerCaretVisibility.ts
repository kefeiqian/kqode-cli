import { useStdout } from 'ink';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { hideTerminalCursor } from '@libs/terminal/cursorVisibility.ts';
import { caretSuppressedWhileScrollingAtom } from '@state/ui/composer/index.ts';
import { composerChromeSignatureAtom, inputLockedAtom } from '@state/ui/index.ts';

/**
 * Keeps the terminal caret in sync with composer focus. Two responsibilities,
 * both driven by subscribing to the home-surface chrome signature so this hook
 * re-renders its host (the composer) on every surrounding repaint:
 *
 *  1. Re-assert the shown caret. Ink only keeps the cursor visible on a frame
 *     where the composer called `setCursorPosition` (its `cursorDirty` flag
 *     resets each render), so a sibling repaint that changes output without
 *     re-rendering the composer would drop the caret. `layoutAtom` covers
 *     body/row-count changes; the chrome signature covers same-size text changes
 *     (git label, model label, hints) — e.g. the git status arriving after load.
 *
 *  2. Hide the cursor while input is locked (backend loading) or the caret is
 *     suppressed during scrolling. The composer sets no cursor position in both
 *     states, but on the fullscreen repaint path Ink only *hides* the cursor
 *     when one was previously shown — so without an explicit hide the hardware
 *     cursor can be left blinking at the repaint baseline. Re-asserted on every
 *     chrome frame so a repaint cannot re-expose it; Ink re-shows the caret
 *     itself once the composer asserts a position after unlock/scroll settle.
 */
export function useComposerCaretVisibility(): void {
  const inputLocked = useAtomValue(inputLockedAtom);
  const caretSuppressed = useAtomValue(caretSuppressedWhileScrollingAtom);
  const chromeSignature = useAtomValue(composerChromeSignatureAtom);
  const { stdout } = useStdout();

  useEffect(() => {
    if (inputLocked || caretSuppressed) {
      hideTerminalCursor(stdout);
    }
  }, [caretSuppressed, inputLocked, chromeSignature, stdout]);
}
