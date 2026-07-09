import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { formatCwdLine } from '@libs/tui/cwdLine.ts';
import { gitStatusLabelAtom, safeChromeColumnsAtom } from '@state/ui/index.ts';
import { activeThemeAtom, workspaceCwdAtom } from '@state/global/index.ts';

export function CwdLine() {
  const workspaceCwd = useAtomValue(workspaceCwdAtom);
  const gitStatusLabel = useAtomValue(gitStatusLabelAtom);
  const columns = useAtomValue(safeChromeColumnsAtom);
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box width={columns}>
      <Text color={theme.colors.foreground} wrap="wrap">
        {formatCwdLine(workspaceCwd, gitStatusLabel)}
      </Text>
    </Box>
  );
}
