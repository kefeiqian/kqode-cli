import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { THEME_CATALOG } from '@theme/themeConfig.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
import { moveThemeHighlightAtom, themeHighlightIndexAtom } from '@state/ui/theme/index.ts';

/**
 * Wires `/theme` navigation and confirm. Arrow keys move only the picker-local
 * highlight; Enter applies the highlighted theme. Esc close is owned by the App
 * shell, so pressing Esc leaves the active theme untouched.
 */
export function useThemeInput(actions: { selectTheme: (theme: ThemeDefinition) => Promise<void> }) {
  const highlightIndex = useAtomValue(themeHighlightIndexAtom);
  const highlightRef = useRef(highlightIndex);
  highlightRef.current = highlightIndex;
  const moveHighlight = useSetAtom(moveThemeHighlightAtom);

  useInput((input, key) => {
    if (isMouseInput(input)) {
      return;
    }
    if (key.upArrow) {
      moveHighlight(-1);
      return;
    }
    if (key.downArrow) {
      moveHighlight(1);
      return;
    }
    if (key.return || input === '\r' || input === '\n') {
      const theme = THEME_CATALOG[highlightRef.current];
      if (theme !== undefined) {
        void actions.selectTheme(theme);
      }
    }
  });
}
