import { Box, Text } from 'ink';
import { ModelRow } from '@components/ModelSurface/ModelRow.tsx';
import type { ModelHighlightIdentity, ModelSurfaceRow } from '@state/ui/model/index.ts';

/** Renders the already-windowed grouped model rows and pads unused body lines. */
export function ModelRows({
  highlight,
  rows,
  visibleRows
}: {
  highlight: ModelHighlightIdentity | null;
  rows: ModelSurfaceRow[];
  visibleRows: number;
}) {
  return (
    <Box flexDirection="column" height={visibleRows}>
      {Array.from({ length: visibleRows }, (_, index) => {
        const row = rows[index];
        return row === undefined ? <Text key={index}> </Text> : <ModelRow key={rowKey(row)} highlight={highlight} row={row} />;
      })}
    </Box>
  );
}

function rowKey(row: ModelSurfaceRow) {
  if (row.type === 'model') {
    return `${row.providerId}:${row.modelId}`;
  }
  return `${row.providerId}:${row.type}`;
}
