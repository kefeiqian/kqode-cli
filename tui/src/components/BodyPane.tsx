import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.ts';
import type { BodyEntry, BodyRow } from '@libs/tui/bodyRows.ts';
import { resolveBodyRowWindow } from '@libs/tui/bodyWindow.ts';
import { selectionBounds } from '@libs/selection/bounds.ts';
import { rowHighlight, type RowHighlight } from '@libs/selection/highlightRow.ts';
import { displayWidth, padEndToWidth } from '@libs/text/displayWidth.ts';
import {
  bodyScrollOffsetRowsAtom,
  bodySelectionAtom,
  displayedBodyEntriesAtom,
  layoutAtom
} from '@state/ui/index.ts';
import { columnsAtom } from '@state/ui/index.ts';
import { theme } from '@theme/themeConfig.ts';
import { SCROLLBAR_THUMB, SCROLLBAR_TRACK } from '@constants/ui.ts';

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
  const selection = useAtomValue(bodySelectionAtom);

  const resolvedEntries = entries ?? atomEntries ?? DEFAULT_BODY_ENTRIES;
  const resolvedRows = rows ?? atomLayout.bodyRows;
  const resolvedColumns = columns ?? atomColumns;
  const resolvedScrollOffsetRows = scrollOffsetRows ?? atomScrollOffsetRows;
  const visibleRows = Math.max(1, resolvedRows);
  const visibleColumns = Math.max(1, resolvedColumns);
  const {
    allRows,
    startIndex: start,
    visibleRows: visibleRowsForOffset
  } = resolveBodyRowWindow(
    resolvedEntries,
    visibleColumns,
    visibleRows,
    resolvedScrollOffsetRows
  );
  const maxScrollOffset = Math.max(0, allRows.length - visibleRows);
  const isScrollable = maxScrollOffset > 0;
  const renderedRows = isScrollable ? visibleRows : Math.min(visibleRows, allRows.length + 1);
  const contentColumns = isScrollable ? Math.max(1, visibleColumns - 1) : visibleColumns;
  const selectionBoundsValue =
    selection === null ? null : selectionBounds(selection.anchor, selection.focus);
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
        const markerWidth = displayWidth(marker);
        const paddedTextColumns = Math.max(1, contentColumns - markerWidth);
        const shouldPadText = isScrollable || row.fillColumns === true;
        const highlight =
          selectionBoundsValue === null || row.decorative === true
            ? null
            : rowHighlight(row.text, start + index, selectionBoundsValue, markerWidth);
        const displayText =
          highlight === null
            ? shouldPadText
              ? padBodyText(row.text, paddedTextColumns)
              : row.text || ' '
            : undefined;

        return (
          <Box key={`${row.text}-${index}`} backgroundColor={row.backgroundColor} width={visibleColumns}>
            {marker.length > 0 ? (
              <Text backgroundColor={row.backgroundColor} color={row.markerColor ?? row.color}>
                {marker}
              </Text>
            ) : null}
            {highlight === null ? (
              <Text backgroundColor={row.backgroundColor} color={row.color}>
                {displayText}
              </Text>
            ) : (
              renderHighlightedContent(highlight, row, paddedTextColumns, shouldPadText)
            )}
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
  return padEndToWidth(text, contentColumns);
}

function renderHighlightedContent(
  highlight: RowHighlight,
  row: BodyRow,
  paddedTextColumns: number,
  shouldPadText: boolean
): ReactNode {
  const padding = shouldPadText
    ? ' '.repeat(Math.max(0, paddedTextColumns - displayWidth(row.text)))
    : '';

  return (
    <>
      {highlight.pre.length > 0 ? (
        <Text backgroundColor={row.backgroundColor} color={row.color}>
          {highlight.pre}
        </Text>
      ) : null}
      <Text backgroundColor={theme.colors.selectionBackground} color={row.color}>
        {highlight.selected}
      </Text>
      {highlight.post.length > 0 ? (
        <Text backgroundColor={row.backgroundColor} color={row.color}>
          {highlight.post}
        </Text>
      ) : null}
      {padding.length > 0 ? (
        <Text backgroundColor={row.backgroundColor} color={row.color}>
          {padding}
        </Text>
      ) : null}
    </>
  );
}
