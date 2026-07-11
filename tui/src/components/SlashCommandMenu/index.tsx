import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { clamp } from '@libs/math/clamp.ts';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { DockDivider } from '@components/DockDivider.tsx';
import {
  commandMenuHighlightIndexAtom,
  commandMenuMatchesAtom,
  commandMenuOpenAtom
} from '@state/ui/commands/index.ts';
import { entryDescription, entryFullName } from '@libs/commands/subcommands.ts';
import { commandMenuRowsAtom } from '@state/ui/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

const NO_MATCHES_LABEL = 'No matching commands';
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
  const theme = useAtomValue(activeThemeAtom);

  if (!isOpen || menuRows === 0) {
    return null;
  }

  // The accent top rule (U5) occupies the first row; command rows fill the rest.
  const contentRows = Math.max(0, menuRows - 1);

  if (matches.length === 0) {
    return (
      <Box flexDirection="column">
        <DockDivider />
        <SelectableRow highlighted={false} color={theme.colors.muted} content={NO_MATCHES_LABEL} />
        {blankRows(contentRows - 1)}
      </Box>
    );
  }

  const highlighted = clamp(highlightIndex, 0, matches.length - 1);
  const start = Math.min(
    Math.max(0, highlighted - contentRows + 1),
    Math.max(0, matches.length - contentRows)
  );
  const visible = matches.slice(start, start + contentRows);
  const nameColumnWidth = Math.max(...matches.map((entry) => entryFullName(entry).length));

  return (
    <Box flexDirection="column">
      <DockDivider />
      {visible.map((entry, index) => {
        const isHighlighted = start + index === highlighted;
        const paddedName = entryFullName(entry).padEnd(nameColumnWidth);
        const content = `${paddedName}${NAME_DESCRIPTION_GAP}${entryDescription(entry)}`;

        return <SelectableRow key={entryFullName(entry)} highlighted={isHighlighted} content={content} />;
      })}
      {blankRows(contentRows - visible.length)}
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
