import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { DockDivider } from '@components/DockDivider.tsx';
import { ThemeRows } from '@components/ThemeSurface/ThemeRows.tsx';
import { useThemeBackend } from '@components/ThemeSurface/useThemeBackend.ts';
import { useThemeInput } from '@components/ThemeSurface/useThemeInput.ts';
import { resolveDockedFooterGap } from '@libs/tui/layout.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { dockedPanelRowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
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
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const panelRows = useAtomValue(dockedPanelRowsAtom);
  const theme = useAtomValue(activeThemeAtom);
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
  const { showFooterGap, chromeRows } = resolveDockedFooterGap({
    panelRows,
    chromeWithGap: THEME_DOCK_CHROME_ROWS
  });
  const listRows = Math.max(1, panelRows - chromeRows);

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
    <Box flexDirection="column" height={panelRows}>
      <DockDivider />
      <Text color={theme.colors.accentBlue}>/theme</Text>
      <ThemeRows
        columns={safeChromeColumns}
        themes={visibleThemes}
        highlightIndex={highlightIndex - windowOffset}
        visibleRows={listRows}
      />
      {showFooterGap ? <Text> </Text> : null}
      <ThemeFooter
        columns={safeChromeColumns}
        warning={warning}
        offset={windowOffset}
        total={THEME_CATALOG.length}
        visible={listRows}
      />
    </Box>
  );
}

function ThemeFooter({
  columns,
  warning,
  offset,
  total,
  visible
}: {
  columns: number;
  warning: string | null;
  offset: number;
  total: number;
  visible: number;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const maxOffset = Math.max(0, total - visible);
  const position =
    maxOffset === 0 ? '' : offset <= 0 ? 'more ↓' : offset >= maxOffset ? 'more ↑' : 'more ↑↓';

  return (
    <Box width={columns}>
      <Text color={warning === null ? theme.colors.muted : theme.colors.warning} wrap="truncate">
        {warning ?? THEME_FOOTER_HINT}
      </Text>
      {position === '' ? null : (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>{position}</Text>
        </Box>
      )}
    </Box>
  );
}
