import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import {
  MIN_USABLE_TERMINAL_COLUMNS,
  MIN_USABLE_TERMINAL_ROWS
} from '@constants/ui.ts';
import { columnsAtom } from '@state/ui/index.ts';
import { theme } from '@theme/themeConfig.ts';

/**
 * Shown instead of the home screen when the terminal is too small to render it
 * usably — too short or too narrow. Kept to a few lines (no fixed height) so it
 * fits the tiny viewport without re-entering Ink's fullscreen path, and recovers
 * automatically once the window grows (the size atoms update on resize).
 */
export function TerminalTooSmall() {
  const columns = useAtomValue(columnsAtom);

  return (
    <Box flexDirection="column" width={columns}>
      <Text color={theme.colors.warning}>Terminal too small</Text>
      <Text color={theme.colors.muted}>Please enlarge or maximize the window</Text>
      <Text color={theme.colors.muted}>
        {`(needs at least ${MIN_USABLE_TERMINAL_COLUMNS} cols \u00D7 ${MIN_USABLE_TERMINAL_ROWS} rows)`}
      </Text>
    </Box>
  );
}
