import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import { DEFAULT_BODY_ENTRIES, resolveBodyRows } from '@libs/tui/bodyRows.ts';
import type { BodyEntry, BodyRow } from '@libs/tui/bodyRows.ts';
import { clamp } from '@libs/math/clamp.ts';
import {
  bodyScrollOffsetRowsAtom,
  displayedBodyEntriesAtom,
  layoutAtom
} from '@state/homeScreen/index.ts';
import { columnsAtom } from '@state/global/index.ts';
import { theme } from '@theme/themeConfig.ts';
import { SCROLLBAR_THUMB, SCROLLBAR_TRACK } from '@constants/ui.ts';

export type { BodyEntry } from '@libs/tui/bodyRows.ts';
export { countBodyRows, DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.ts';

type ScrollbarCell = {
  color: string;
  text: string;
};

type BodyPaneProps = {
  entries?: readonly BodyEntry[];
  rows?: number;
  columns?: number;
  scrollOffsetRows?: number;
};

export function BodyPane({
  entries,
  rows,
  columns,
  scrollOffsetRows
}: BodyPaneProps) {
  const atomEntries = useAtomValue(displayedBodyEntriesAtom);
  const atomLayout = useAtomValue(layoutAtom);
  const atomColumns = useAtomValue(columnsAtom);
  const atomScrollOffsetRows = useAtomValue(bodyScrollOffsetRowsAtom);

  const resolvedEntries = entries ?? atomEntries ?? DEFAULT_BODY_ENTRIES;
  const resolvedRows = rows ?? atomLayout.bodyRows;
  const resolvedColumns = columns ?? atomColumns;
  const resolvedScrollOffsetRows = scrollOffsetRows ?? atomScrollOffsetRows;
  const visibleRows = Math.max(1, resolvedRows);
  const visibleColumns = Math.max(1, resolvedColumns);
  const allRows = resolveBodyRows(resolvedEntries, visibleColumns, visibleRows);
  const maxScrollOffset = Math.max(0, allRows.length - visibleRows);
  const scrollOffset = clamp(resolvedScrollOffsetRows, 0, maxScrollOffset);
  // Offset counts rows back from the newest content at the bottom, matching
  // terminal transcript behavior where scroll offset 0 means "stick to bottom".
  const end = allRows.length - scrollOffset;
  const start = Math.max(0, end - visibleRows);
  const isScrollable = maxScrollOffset > 0;
  const renderedRows = isScrollable ? visibleRows : Math.min(visibleRows, allRows.length + 1);
  const contentColumns = isScrollable ? Math.max(1, visibleColumns - 1) : visibleColumns;
  const visibleRowsForOffset = allRows.slice(start, end);
  const scrollbarCells = isScrollable
    ? renderScrollbar({
        rows: visibleRows,
        totalRows: allRows.length,
        startRow: start
      })
    : [];

  return (
    <Box flexDirection="column" height={renderedRows}>
      {Array.from({ length: renderedRows }, (_, index) => {
        const row = visibleRowsForOffset[index] ?? {
          color: theme.colors.muted,
          text: ''
        };
        const marker = row.marker ?? '';
        const paddedTextColumns = Math.max(1, contentColumns - marker.length);
        const shouldPadText = isScrollable || row.fillColumns === true;
        const displayText = shouldPadText
          ? padBodyText(row.text, paddedTextColumns)
          : row.text || ' ';

        return (
          <Box key={`${row.text}-${index}`} backgroundColor={row.backgroundColor} width={visibleColumns}>
            {marker.length > 0 ? (
              <Text backgroundColor={row.backgroundColor} color={row.markerColor ?? row.color}>
                {marker}
              </Text>
            ) : null}
            <Text backgroundColor={row.backgroundColor} color={row.color}>
              {displayText}
            </Text>
            {isScrollable ? (
              <Text color={scrollbarCells[index]?.color ?? theme.colors.border}>
                {scrollbarCells[index]?.text ?? SCROLLBAR_TRACK}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function renderScrollbar({
  rows,
  totalRows,
  startRow
}: {
  rows: number;
  totalRows: number;
  startRow: number;
}): ScrollbarCell[] {
  // Scale the thumb to the visible fraction, then map the first visible row to
  // the same fraction of the scrollbar track so top/bottom positions align.
  const thumbRows = Math.max(1, Math.floor((rows / totalRows) * rows));
  const maxThumbStart = rows - thumbRows;
  const maxStartRow = totalRows - rows;
  const thumbStart =
    maxStartRow === 0 ? 0 : Math.round((startRow / maxStartRow) * maxThumbStart);

  return Array.from({ length: rows }, (_, index) => {
    const isThumb = index >= thumbStart && index < thumbStart + thumbRows;

    return {
      color: isThumb ? theme.colors.foreground : theme.colors.border,
      text: isThumb ? SCROLLBAR_THUMB : SCROLLBAR_TRACK
    };
  });
}

function padBodyText(text: string, contentColumns: number): string {
  return text.padEnd(contentColumns, ' ');
}
