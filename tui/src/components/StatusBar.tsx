import { Box, Text } from 'ink';
import { githubDarkTheme } from '@theme/themeConfig.js';

type StatusBarProps = {
  columns: number;
  modelLabel: string;
};

export function StatusBar({ columns, modelLabel }: StatusBarProps) {
  const leftHints = columns >= 60 ? '/ commands | @ mention | ? help' : '/ | @ | ?';
  const showModel = columns >= 60;

  return (
    <Box width={columns}>
      <Text color={githubDarkTheme.colors.muted}>{leftHints}</Text>
      {showModel ? (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={githubDarkTheme.colors.accentGreen}>{modelLabel}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
