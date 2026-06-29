import { Box, Text } from 'ink';
import { resolveBodyRows } from '@components/bodyRows.js';
import type { BodyBackgroundMode, BodyEntry, BodyRow } from '@components/bodyRows.js';
import { githubDarkTheme } from '@theme/themeConfig.js';

export type { BodyEntry } from '@components/bodyRows.js';

type ScrollbarCell = {
  color: string;
  text: string;
};

type BodyPaneProps = {
  entries?: readonly BodyEntry[];
  rows: number;
  columns: number;
  scrollOffsetRows?: number;
  backgroundMode?: BodyBackgroundMode;
};

const SCROLLBAR_TRACK = '│';
const SCROLLBAR_THUMB = '┃';

export const DEFAULT_BODY_ENTRIES: readonly BodyEntry[] = [];

export function BodyPane({
  entries = DEFAULT_BODY_ENTRIES,
  rows,
  columns,
  scrollOffsetRows = 0,
  backgroundMode = 'disabled'
}: BodyPaneProps) {
  const visibleRows = Math.max(1, rows);
  const visibleColumns = Math.max(1, columns);
  const allRows = resolveBodyRows(entries, visibleColumns, visibleRows, { backgroundMode });
  const maxScrollOffset = Math.max(0, allRows.length - visibleRows);
  const scrollOffset = clamp(scrollOffsetRows, 0, maxScrollOffset);
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
          color: githubDarkTheme.colors.muted,
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
              <Text color={scrollbarCells[index]?.color ?? githubDarkTheme.colors.border}>
                {scrollbarCells[index]?.text ?? SCROLLBAR_TRACK}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

export function countBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number,
  backgroundMode: BodyBackgroundMode = 'disabled'
): number {
  return resolveBodyRows(entries, Math.max(1, columns), Math.max(1, visibleRows), {
    backgroundMode
  }).length;
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
  const thumbRows = Math.max(1, Math.floor((rows / totalRows) * rows));
  const maxThumbStart = rows - thumbRows;
  const maxStartRow = totalRows - rows;
  const thumbStart =
    maxStartRow === 0 ? 0 : Math.round((startRow / maxStartRow) * maxThumbStart);

  return Array.from({ length: rows }, (_, index) => {
    const isThumb = index >= thumbStart && index < thumbStart + thumbRows;

    return {
      color: isThumb ? githubDarkTheme.colors.foreground : githubDarkTheme.colors.border,
      text: isThumb ? SCROLLBAR_THUMB : SCROLLBAR_TRACK
    };
  });
}

function padBodyText(text: string, contentColumns: number): string {
  return text.padEnd(contentColumns, ' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
