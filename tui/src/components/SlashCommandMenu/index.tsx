import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import {
  commandMenuHighlightIndexAtom,
  commandMenuMatchesAtom,
  commandMenuOpenAtom
} from '@state/ui/commands/index.ts';
import { safeChromeColumnsAtom } from '@state/ui/index.ts';
import { commandMenuRowsAtom } from '@state/ui/index.ts';
import { theme } from '@theme/themeConfig.ts';

const NO_MATCHES_LABEL = 'No matching commands';
const HIGHLIGHT_MARKER = '\u276F '; // "❯ "
const PLAIN_MARKER = '  ';
const NAME_DESCRIPTION_GAP = '  ';

/**
 * The floating slash-command menu, rendered directly above the composer while a
 * command query is open. Its height is budgeted by `commandMenuRowsAtom` (U4),
 * so this component only reads that height and renders exactly that many rows:
 * matching commands fill from the top and any remaining rows are painted blank,
 * keeping the panel a stable height so the composer never shifts as the query
 * narrows. Command names are padded to the widest match so descriptions align in
 * a single column, and rows are truncated to the shared safe chrome width.
 */
export function SlashCommandMenu() {
  const isOpen = useAtomValue(commandMenuOpenAtom);
  const matches = useAtomValue(commandMenuMatchesAtom);
  const highlightIndex = useAtomValue(commandMenuHighlightIndexAtom);
  const menuRows = useAtomValue(commandMenuRowsAtom);
  const columns = useAtomValue(safeChromeColumnsAtom);

  if (!isOpen || menuRows === 0) {
    return null;
  }

  if (matches.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={theme.colors.muted}>{truncate(`${PLAIN_MARKER}${NO_MATCHES_LABEL}`, columns)}</Text>
        {blankRows(menuRows - 1)}
      </Box>
    );
  }

  const highlighted = clamp(highlightIndex, 0, matches.length - 1);
  const start = Math.min(
    Math.max(0, highlighted - menuRows + 1),
    Math.max(0, matches.length - menuRows)
  );
  const visible = matches.slice(start, start + menuRows);
  const nameColumnWidth = Math.max(...matches.map((command) => command.name.length));

  return (
    <Box flexDirection="column">
      {visible.map((command, index) => {
        const isHighlighted = start + index === highlighted;
        const marker = isHighlighted ? HIGHLIGHT_MARKER : PLAIN_MARKER;
        const paddedName = command.name.padEnd(nameColumnWidth);
        const line = truncate(`${marker}${paddedName}${NAME_DESCRIPTION_GAP}${command.description}`, columns);

        return (
          <Text
            key={command.id}
            color={isHighlighted ? theme.colors.accentBlue : theme.colors.foreground}
          >
            {line}
          </Text>
        );
      })}
      {blankRows(menuRows - visible.length)}
    </Box>
  );
}

/**
 * Blank filler rows that keep the panel at its fixed `commandMenuRowsAtom` height
 * as matches narrow, so the composer below never shifts. Each row paints a single
 * space so the terminal reserves the line rather than collapsing it.
 */
function blankRows(count: number) {
  if (count <= 0) {
    return null;
  }

  return Array.from({ length: count }, (_unused, index) => <Text key={`blank-${index}`}> </Text>);
}

/** Keeps a row inside the shared safe chrome width. */
function truncate(text: string, columns: number): string {
  return text.slice(0, Math.max(0, columns));
}
