import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { renderCwdLine } from '@libs/tui/cwdLine.ts';
import { chromeColumnsAtom, gitStatusAtom } from '@state/ui/index.ts';
import { workspaceCwdAtom } from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';

export function CwdLine() {
  const workspaceCwd = useAtomValue(workspaceCwdAtom);
  const gitStatus = useAtomValue(gitStatusAtom);
  const columns = useAtomValue(chromeColumnsAtom);

  return (
    <Box width={columns}>
      <Text color={theme.colors.foreground}>{renderCwdLine(workspaceCwd, gitStatus)}</Text>
    </Box>
  );
}
