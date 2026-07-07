import { useStdout } from 'ink';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { hideTerminalCursor } from '@libs/terminal/cursorVisibility.ts';
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
 *  2. Hide the cursor while input is locked (backend loading). The composer sets
 *     no cursor position while locked, but on the fullscreen repaint path Ink
 *     only *hides* the cursor when one was previously shown — so without an
 *     explicit hide the hardware cursor is left blinking at the end of the last
 *     output row. Re-asserted on every chrome frame so a repaint cannot
 *     re-expose it; Ink re-shows the caret itself once the composer asserts a
 *     position after unlock. Copy Mode is intentionally NOT hidden here: it
 *     releases the cursor to the terminal for native selection.
 */
export function useComposerCaretVisibility(): void {
  const inputLocked = useAtomValue(inputLockedAtom);
  const chromeSignature = useAtomValue(composerChromeSignatureAtom);
  const { stdout } = useStdout();

  useEffect(() => {
    if (inputLocked) {
      hideTerminalCursor(stdout);
    }
  }, [inputLocked, chromeSignature, stdout]);
}
