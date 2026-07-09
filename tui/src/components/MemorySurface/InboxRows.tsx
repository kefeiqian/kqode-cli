import { Box, Text } from 'ink';
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
  const lines = [formatInboxHeader(columns), ...entries.map((entry, index) => formatInboxRow(entry, index, columns))];
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        const line = lines[index];
        if (line === undefined) {
          return <Text key={index}> </Text>;
        }
        const entry = index === 0 ? null : entries[index - 1];
        return (
          <Text key={entry?.id ?? 'header'} inverse={entry?.id === highlightedId}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
