import { Box, Text } from 'ink';
import type { MemoryItem } from '@contracts/backend/index.ts';
import { formatMemoryHeader, formatMemoryRow } from '@libs/memory/formatMemoryRows.ts';

export function MemoryRows({
  columns,
  items,
  visibleRows,
  highlightedId
}: {
  columns: number;
  items: readonly MemoryItem[];
  visibleRows: number;
  highlightedId: string | null;
}) {
  const lines = [formatMemoryHeader(columns), ...items.map((item, index) => formatMemoryRow(item, index, columns))];
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        const line = lines[index];
        if (line === undefined) {
          return <Text key={index}> </Text>;
        }
        const item = index === 0 ? null : items[index - 1];
        return (
          <Text key={item?.id ?? 'header'} inverse={item?.id === highlightedId}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
