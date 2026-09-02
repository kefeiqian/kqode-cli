import { Box, Text } from 'ink';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import { SELECTION_GUTTER, SELECTION_GUTTER_WIDTH } from '@constants/ui.ts';
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
  // Columnar content is formatted at the reduced width; SelectableRow re-adds the
  // chevron gutter and bar so data rows align under the blank-gutter header.
  const contentColumns = columns - SELECTION_GUTTER_WIDTH;
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        if (index === 0) {
          return <Text key="header">{`${SELECTION_GUTTER}${formatMemoryHeader(contentColumns)}`}</Text>;
        }
        const item = items[index - 1];
        if (item === undefined) {
          return <Text key={index}> </Text>;
        }
        return (
          <SelectableRow
            key={item.id}
            highlighted={item.id === highlightedId}
            content={formatMemoryRow(item, index - 1, contentColumns)}
          />
        );
      })}
    </Box>
  );
}
