import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { CommandSurface } from '@components/CommandSurface/index.tsx';
import { useCommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { ThemeRows } from '@components/ThemeSurface/ThemeRows.tsx';
import { useThemeBackend } from '@components/ThemeSurface/useThemeBackend.ts';
import { useThemeInput } from '@components/ThemeSurface/useThemeInput.ts';
import { positionIndicator } from '@libs/tui/layout.ts';
import { dockedPanelRowsAtom } from '@state/ui/index.ts';
import { closeActiveSurfaceAtom } from '@state/ui/surface/index.ts';
import {
  resetThemeSurfaceAtom,
  revertThemePreviewAtom,
  scrollThemeHighlightIntoViewAtom,
  THEME_DOCK_CHROME_ROWS,
  themeHighlightIndexAtom,
  themeSaveWarningAtom,
  themeVisibleRowsAtom,
  themeWindowOffsetAtom,
  visibleThemesAtom
} from '@state/ui/theme/index.ts';
import { THEME_CATALOG } from '@theme/themeConfig.ts';

const THEME_FOOTER_HINT = '↑/↓ choose · enter apply · esc close';

/** Bottom-docked `/theme` picker over the built-in dark preset catalog. */
export function ThemeSurface() {
  const panelRows = useAtomValue(dockedPanelRowsAtom);
  const highlightIndex = useAtomValue(themeHighlightIndexAtom);
  const windowOffset = useAtomValue(themeWindowOffsetAtom);
  const visibleThemes = useAtomValue(visibleThemesAtom);
  const warning = useAtomValue(themeSaveWarningAtom);
  const resetThemeSurface = useSetAtom(resetThemeSurfaceAtom);
  const setVisibleRows = useSetAtom(themeVisibleRowsAtom);
  const scrollHighlightIntoView = useSetAtom(scrollThemeHighlightIntoViewAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const revertThemePreview = useSetAtom(revertThemePreviewAtom);
  const { selectTheme } = useThemeBackend(closeActiveSurface);
  const layout = useCommandSurfaceLayout({ panelRows, chromeWithGap: THEME_DOCK_CHROME_ROWS });
  const listRows = layout.bodyRows;

  useThemeInput({ selectTheme });

  useEffect(() => {
    resetThemeSurface();
    // A confirmed theme adopts itself as the baseline, so this revert only
    // undoes an un-confirmed navigation preview (Esc/cancel).
    return () => {
      revertThemePreview();
    };
  }, [resetThemeSurface, revertThemePreview]);

  useEffect(() => {
    setVisibleRows(listRows);
    scrollHighlightIntoView();
  }, [listRows, setVisibleRows, scrollHighlightIntoView]);

  return (
    <CommandSurface
      panelRows={panelRows}
      layout={layout}
      label="/theme"
      bodyRows={listRows}
      footerHint={warning ?? THEME_FOOTER_HINT}
      footerTone={warning === null ? 'muted' : 'warning'}
      position={positionIndicator(windowOffset, Math.max(0, THEME_CATALOG.length - listRows))}
    >
      <ThemeRows
        themes={visibleThemes}
        highlightIndex={highlightIndex - windowOffset}
        visibleRows={listRows}
      />
    </CommandSurface>
  );
}
