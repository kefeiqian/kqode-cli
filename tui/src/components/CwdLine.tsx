import { Box, Text } from 'ink';
import { formatCwdLine, formatDisplayCwd } from '@libs/tui/cwdLine.js';
import { geminiDarkTheme } from '@theme/themeConfig.js';

type CwdLineProps = {
  workspaceCwd: string;
  gitStatusLabel?: string;
  columns: number;
};

export { formatDisplayCwd };

export function CwdLine({ workspaceCwd, gitStatusLabel }: CwdLineProps) {
  return (
    <Box>
      <Text color={geminiDarkTheme.colors.foreground}>{formatCwdLine(workspaceCwd, gitStatusLabel)}</Text>
    </Box>
  );
}
