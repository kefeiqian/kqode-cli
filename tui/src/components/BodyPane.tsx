import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { DEFAULT_BODY_ENTRIES, resolveBodyRows } from '@libs/tui/bodyRows.ts';
import type { BodyEntry, BodyRow } from '@libs/tui/bodyRows.ts';
import { clamp } from '@libs/math/clamp.ts';
import { displayWidth, padEndToWidth } from '@libs/text/displayWidth.ts';
import { isAllowedLinkHref, sanitizeLinkHref } from '@libs/markdown/linkSegment.ts';
import {
  bodyScrollOffsetRowsAtom,
  displayedBodyEntriesAtom,
  layoutAtom,
  safeChromeColumnsAtom
} from '@state/ui/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
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
  /**
   * Safe content width the body wraps into. The physical final terminal column
   * is a reserved gutter owned by the parent background box, so no body glyph
   * lands in the risky last cell (see `safeChromeColumnsAtom`). Defaults to that
   * atom; tests pass an explicit width, which is treated as the content width.
   */
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
  const atomSafeColumns = useAtomValue(safeChromeColumnsAtom);
  const atomScrollOffsetRows = useAtomValue(bodyScrollOffsetRowsAtom);
  const theme = useAtomValue(activeThemeAtom);

  const resolvedEntries = entries ?? atomEntries ?? DEFAULT_BODY_ENTRIES;
  const resolvedRows = rows ?? atomLayout.bodyRows;
  const resolvedColumns = columns ?? atomSafeColumns;
  const resolvedScrollOffsetRows = scrollOffsetRows ?? atomScrollOffsetRows;
  const visibleRows = Math.max(1, resolvedRows);
  const visibleColumns = Math.max(1, resolvedColumns);
  const allRows = resolveBodyRows(resolvedEntries, visibleColumns, visibleRows, theme);
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
        startRow: start,
        theme
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
        const segmentDisplay = renderSegments(row, paddedTextColumns, shouldPadText);
        const displayText =
          segmentDisplay === undefined
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
            {segmentDisplay ?? (
              <Text backgroundColor={row.backgroundColor} color={row.color}>
                {displayText}
              </Text>
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
  startRow,
  theme
}: {
  rows: number;
  totalRows: number;
  startRow: number;
  theme: ThemeDefinition;
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

const RENDER_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const ENABLE_OSC8_LINKS = false;

function sanitizeRenderedText(text: string): string {
  return text.replace(RENDER_CONTROL_CHAR_PATTERN, '');
}

function renderSegments(
  row: BodyRow,
  contentColumns: number,
  shouldPadText: boolean
): ReactNode | undefined {
  if (row.segments === undefined) {
    return undefined;
  }

  const sanitizedSegments = row.segments.map((segment) => ({
    ...segment,
    href: segment.href === undefined ? undefined : sanitizeLinkHref(segment.href),
    text: sanitizeRenderedText(segment.text)
  }));
  const text = sanitizedSegments.map((segment) => segment.text).join('');
  const padding =
    shouldPadText || text.length === 0 ? padEndToWidth('', contentColumns - displayWidth(text)) : '';

  return (
    <>
      {sanitizedSegments.map((segment, index) => (
        <Text
          key={`${index}-${segment.text}`}
          backgroundColor={segment.backgroundColor ?? row.backgroundColor}
          bold={segment.bold}
          color={segment.color ?? row.color}
          dimColor={segment.dimColor}
          italic={segment.italic}
          underline={segment.underline}
        >
          {renderSegmentText(segment)}
        </Text>
      ))}
      {padding.length > 0 ? (
        <Text backgroundColor={row.backgroundColor} color={row.color}>
          {padding}
        </Text>
      ) : null}
    </>
  );
}

function renderSegmentText(segment: NonNullable<BodyRow['segments']>[number]): string {
  if (segment.href === undefined) {
    return segment.text;
  }

  const href = sanitizeLinkHref(segment.href);
  if (ENABLE_OSC8_LINKS && isAllowedLinkHref(href)) {
    return `\u001b]8;;${href}\u0007${segment.text}\u001b]8;;\u0007`;
  }

  return segment.text === href ? segment.text : `${segment.text} (${href})`;
}
