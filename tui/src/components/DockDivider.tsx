import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { activeThemeAtom } from '@state/global/index.ts';
import { safeChromeColumnsAtom } from '@state/ui/index.ts';

/**
 * The accent-colored top separator rule marking the boundary between the
 * transcript body above and a docked command popup below. Rendered at the shared
 * safe content width inside a width-bounded `Box` so it never depends on the
 * reserved final terminal column. Shared by every docked popup (theme, model,
 * login, memory, resume).
 */
export function DockDivider() {
  const columns = useAtomValue(safeChromeColumnsAtom);
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box width={columns}>
      <Text color={theme.colors.accentBlue}>{'─'.repeat(columns)}</Text>
    </Box>
  );
}
