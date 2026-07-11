import { Box, Text } from 'ink';
import { ThemeRow } from '@components/ThemeSurface/ThemeRow.tsx';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

/** Renders the theme rows and pads unused body lines to a stable height. */
export function ThemeRows({
  themes,
  highlightIndex,
  visibleRows
}: {
  themes: readonly ThemeDefinition[];
  highlightIndex: number;
  visibleRows: number;
}) {
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        const theme = themes[index];
        return theme === undefined ? (
          <Text key={index}> </Text>
        ) : (
          <ThemeRow key={theme.id} theme={theme} highlighted={index === highlightIndex} />
        );
      })}
    </Box>
  );
}
