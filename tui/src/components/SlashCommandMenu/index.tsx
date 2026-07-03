import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import {
  commandMenuHighlightIndexAtom,
  commandMenuMatchesAtom,
  commandMenuOpenAtom
} from '@state/commands/index.ts';
import { columnsAtom } from '@state/global/index.ts';
import { commandMenuRowsAtom } from '@state/homeScreen/index.ts';
import { theme } from '@theme/themeConfig.ts';

const NO_MATCHES_LABEL = 'No matching commands';
const HIGHLIGHT_MARKER = '\u276F '; // "❯ "
const PLAIN_MARKER = '  ';

/**
 * The floating slash-command menu, rendered directly above the composer while a
 * command query is open. Its height is budgeted by `commandMenuRowsAtom` (U4),
 * so this component only reads that height and renders within it. Rows are
 * truncated to `columns - 1` to keep the terminal's final column clear.
 */
export function SlashCommandMenu() {
  const isOpen = useAtomValue(commandMenuOpenAtom);
  const matches = useAtomValue(commandMenuMatchesAtom);
  const highlightIndex = useAtomValue(commandMenuHighlightIndexAtom);
  const menuRows = useAtomValue(commandMenuRowsAtom);
  const columns = useAtomValue(columnsAtom);

  if (!isOpen || menuRows === 0) {
    return null;
  }

  if (matches.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={theme.colors.muted}>{truncate(`${PLAIN_MARKER}${NO_MATCHES_LABEL}`, columns)}</Text>
      </Box>
    );
  }

  const highlighted = clamp(highlightIndex, 0, matches.length - 1);
  const start = Math.min(
    Math.max(0, highlighted - menuRows + 1),
    Math.max(0, matches.length - menuRows)
  );
  const visible = matches.slice(start, start + menuRows);

  return (
    <Box flexDirection="column">
      {visible.map((command, index) => {
        const isHighlighted = start + index === highlighted;
        const marker = isHighlighted ? HIGHLIGHT_MARKER : PLAIN_MARKER;
        const line = truncate(`${marker}${command.name}  ${command.description}`, columns);

        return (
          <Text
            key={command.id}
            color={isHighlighted ? theme.colors.accentBlue : theme.colors.foreground}
          >
            {line}
          </Text>
        );
      })}
    </Box>
  );
}

/** Keeps a row one column short of the edge; Ink drops final-column glyphs on some terminals. */
function truncate(text: string, columns: number): string {
  return text.slice(0, Math.max(0, columns - 1));
}
