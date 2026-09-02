import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { activeThemeAtom } from '@state/global/index.ts';

/** Footer hint color role. `warning` swaps in the theme warning color (e.g. `/theme`'s unsaved notice). */
export type FooterTone = 'muted' | 'warning';

/**
 * The shared bottom-pinned footer for every docked command surface: a shortcut
 * `hint` on the left (truncated) and an optional right-aligned scroll `position`
 * indicator. Room for the indicator is reserved (`columns − position.length − 1`)
 * so a long hint truncates instead of wrapping to a second row and
 * over-subscribing the panel. `tone` selects the hint color.
 */
export function CommandFooter({
  columns,
  hint,
  position,
  tone = 'muted'
}: {
  columns: number;
  hint: string;
  position: string;
  tone?: FooterTone;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const hintColor = tone === 'warning' ? theme.colors.warning : theme.colors.muted;
  const hintWidth = position === '' ? columns : Math.max(0, columns - position.length - 1);

  return (
    <Box width={columns}>
      <Text color={hintColor} wrap="truncate">
        {hint.slice(0, hintWidth)}
      </Text>
      {position === '' ? null : (
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>{position}</Text>
        </Box>
      )}
    </Box>
  );
}
