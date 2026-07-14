import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { formatCwdLine } from '@libs/tui/cwdLine.ts';
import { gitStatusAtom } from '@state/ui/index.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function CwdLine() {
  const workspaceCwd = useAtomValue(workspaceCwdAtom);
  const gitStatus = useAtomValue(gitStatusAtom);

  return (
    <Box>
      <Text color={theme.colors.foreground}>{formatCwdLine(workspaceCwd, gitStatus)}</Text>
    </Box>
  );
}
