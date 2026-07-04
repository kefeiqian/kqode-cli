import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { formatCwdLine } from '@libs/tui/cwdLine.ts';
import { gitStatusLabelAtom } from '@state/ui/index.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function CwdLine() {
  const workspaceCwd = useAtomValue(workspaceCwdAtom);
  const gitStatusLabel = useAtomValue(gitStatusLabelAtom);

  return (
    <Box>
      <Text color={theme.colors.foreground}>{formatCwdLine(workspaceCwd, gitStatusLabel)}</Text>
    </Box>
  );
}
