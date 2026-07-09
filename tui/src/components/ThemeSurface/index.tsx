import { Box, Text } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { ThemeRows } from '@components/ThemeSurface/ThemeRows.tsx';
import { useThemeBackend } from '@components/ThemeSurface/useThemeBackend.ts';
import { useThemeInput } from '@components/ThemeSurface/useThemeInput.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { columnsAtom, rowsAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import { closeActiveSurfaceAtom } from '@state/ui/surface/index.ts';
import {
  resetThemeSurfaceAtom,
  themeHighlightIndexAtom,
  themeSaveWarningAtom
} from '@state/ui/theme/index.ts';
import { THEME_CATALOG } from '@theme/themeConfig.ts';

const HEADER_ROWS = 3;
const FOOTER_ROWS = 1;
const THEME_FOOTER_HINT = '↑/↓ choose · enter apply · esc close';

/** Fullscreen `/theme` picker over the built-in dark preset catalog. */
export function ThemeSurface() {
  const columns = useAtomValue(columnsAtom);
  const safeChromeColumns = useAtomValue(safeChromeColumnsAtom);
  const rows = useAtomValue(rowsAtom);
  const theme = useAtomValue(activeThemeAtom);
  const highlightIndex = useAtomValue(themeHighlightIndexAtom);
  const warning = useAtomValue(themeSaveWarningAtom);
  const resetThemeSurface = useSetAtom(resetThemeSurfaceAtom);
  const closeActiveSurface = useSetAtom(closeActiveSurfaceAtom);
  const { selectTheme } = useThemeBackend(closeActiveSurface);
  const bodyRows = useMemo(() => Math.max(1, rows - HEADER_ROWS - FOOTER_ROWS), [rows]);

  useThemeInput({ selectTheme });

  useEffect(() => {
    resetThemeSurface();
  }, [resetThemeSurface]);

  return (
    <Box flexDirection="column" width={columns} height={rows} backgroundColor={theme.colors.bodyBackground}>
      <Text color={theme.colors.accentBlue}>/theme</Text>
      <Text color={theme.colors.muted}>Choose a color theme. Applies on Enter; Esc cancels.</Text>
      <Text> </Text>
      <ThemeRows
        columns={safeChromeColumns}
        themes={THEME_CATALOG}
        highlightIndex={highlightIndex}
        visibleRows={bodyRows}
      />
      <ThemeFooter columns={safeChromeColumns} warning={warning} />
    </Box>
  );
}

function ThemeFooter({ columns, warning }: { columns: number; warning: string | null }) {
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box width={columns}>
      <Text color={warning === null ? theme.colors.muted : theme.colors.warning} wrap="truncate">
        {warning ?? THEME_FOOTER_HINT}
      </Text>
    </Box>
  );
}
