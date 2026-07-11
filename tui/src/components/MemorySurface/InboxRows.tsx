import { Box, Text } from 'ink';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { SELECTION_GUTTER, SELECTION_GUTTER_WIDTH } from '@constants/ui.ts';
import type { MemoryInboxEntry } from '@contracts/backend/index.ts';
import { formatInboxHeader, formatInboxRow } from '@libs/memory/formatInboxRows.ts';

export function InboxRows({
  columns,
  entries,
  visibleRows,
  highlightedId
}: {
  columns: number;
  entries: readonly MemoryInboxEntry[];
  visibleRows: number;
  highlightedId: string | null;
}) {
  const contentColumns = columns - SELECTION_GUTTER_WIDTH;
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        if (index === 0) {
          return <Text key="header">{`${SELECTION_GUTTER}${formatInboxHeader(contentColumns)}`}</Text>;
        }
        const entry = entries[index - 1];
        if (entry === undefined) {
          return <Text key={index}> </Text>;
        }
        return (
          <SelectableRow
            key={entry.id}
            highlighted={entry.id === highlightedId}
            content={formatInboxRow(entry, index - 1, contentColumns)}
          />
        );
      })}
    </Box>
  );
}
