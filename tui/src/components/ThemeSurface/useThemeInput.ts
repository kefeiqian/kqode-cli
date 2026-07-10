import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import { THEME_CATALOG } from '@theme/themeConfig.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
import { moveThemeHighlightAtom, themeHighlightIndexAtom } from '@state/ui/theme/index.ts';

/**
 * Wires `/theme` navigation and confirm. Arrow keys move the highlight and
 * live-preview the highlighted theme (via {@link moveThemeHighlightAtom}); Enter
 * persists the previewed theme. Esc close is owned by the App shell, and the
 * ThemeSurface reverts the preview on unmount, so pressing Esc restores the
 * theme that was active when the picker opened.
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
