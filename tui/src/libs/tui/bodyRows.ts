import {
  LOWER_HALF_BLOCK,
  UPPER_HALF_BLOCK
} from '@libs/tui/backgroundBlock.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import { theme } from '@theme/themeConfig.ts';

export type BodyEntry = {
  id?: string;
  kind: BodyEntryKind;
  text: string;
};

export type BodyRow = {
  backgroundColor?: string;
  color?: string;
  fillColumns?: boolean;
  marker?: string;
  markerColor?: string;
  text: string;
};

export const DEFAULT_BODY_ENTRIES: readonly BodyEntry[] = [];

const ASSISTANT_MESSAGE_PREFIX = '• ';
const USER_MESSAGE_PREFIX = '❯ ';
const USER_MESSAGE_HORIZONTAL_PADDING = 2;

export function resolveBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number
): BodyRow[] {
  const fullWidthRows = toBodyRowsWithEntryGaps(entries, columns);
  // If content overflows vertically, reserve the final terminal column for the
  // scrollbar and re-wrap text so body rows do not collide with it.
  const contentColumns = fullWidthRows.length > visibleRows ? Math.max(1, columns - 1) : columns;

  return contentColumns === columns
    ? fullWidthRows
    : toBodyRowsWithEntryGaps(entries, contentColumns);
}

export function countBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number
): number {
  return resolveBodyRows(entries, Math.max(1, columns), Math.max(1, visibleRows)).length;
}

function toBodyRowsWithEntryGaps(entries: readonly BodyEntry[], columns: number): BodyRow[] {
  return entries.flatMap((entry) => toBodyRows(entry, columns));
}

// Wrapping a `BodyEntry` depends only on its immutable kind/text and the column
// width, so memoize the rendered rows per entry identity and width. During
// streaming only the changed entry is a fresh object (new identity), so the rest
// of the transcript hits the cache instead of re-wrapping on every token/render;
// resizes and scrolls reuse it too. Entries are GC'd from the WeakMap once the
// transcript drops them (e.g. on `/clear`).
// NOTE: assumes `theme` colors are static for the process. If runtime theming is
// added, include the active theme in the cache key.
const MAX_CACHED_WIDTHS = 4;
const bodyRowsByEntry = new WeakMap<BodyEntry, Map<number, BodyRow[]>>();

function toBodyRows(entry: BodyEntry, columns: number): BodyRow[] {
  let rowsByWidth = bodyRowsByEntry.get(entry);
  if (rowsByWidth === undefined) {
    rowsByWidth = new Map();
    bodyRowsByEntry.set(entry, rowsByWidth);
  }

  const cached = rowsByWidth.get(columns);
  if (cached !== undefined) {
    return cached;
  }

  // Bound the per-entry width cache so a continuous terminal resize (many
  // distinct widths) cannot grow it without limit; the current and scrollbar
  // widths always stay resident.
  if (rowsByWidth.size >= MAX_CACHED_WIDTHS) {
    const oldest = rowsByWidth.keys().next().value;
    if (oldest !== undefined) {
      rowsByWidth.delete(oldest);
    }
  }

  const rows = computeBodyRows(entry, columns);
  rowsByWidth.set(columns, rows);
  return rows;
}

function computeBodyRows(entry: BodyEntry, columns: number): BodyRow[] {
  if (entry.kind === BodyEntryKind.User) {
    return toPromptRows(entry.text, columns);
  }

  if (entry.kind === BodyEntryKind.Assistant) {
    return toAssistantRows(entry.text, columns);
  }

  return wrapBodyText(labelForEntry(entry), columns).map((text) => ({
    color: colorForEntry(entry.kind),
    text
  }));
}

function toAssistantRows(text: string, columns: number): BodyRow[] {
  const continuationPrefix = ' '.repeat(ASSISTANT_MESSAGE_PREFIX.length);
  const wrappedText = wrapBodyText(text, Math.max(1, columns - ASSISTANT_MESSAGE_PREFIX.length));

  return wrappedText.map((line, index) => ({
    color: theme.colors.foreground,
    marker: index === 0 ? ASSISTANT_MESSAGE_PREFIX : continuationPrefix,
    markerColor: index === 0 ? theme.colors.accentBlue : theme.colors.foreground,
    text: line
  }));
}

function toPromptRows(text: string, columns: number): BodyRow[] {
  const promptIndent = USER_MESSAGE_HORIZONTAL_PADDING + USER_MESSAGE_PREFIX.length;
  // User prompts have symmetric horizontal padding inside their message block;
  // continuation rows replace the visible prefix with spaces to align wrapped text.
  const textColumns = Math.max(1, columns - promptIndent - USER_MESSAGE_HORIZONTAL_PADDING);
  const continuationPrefix = ' '.repeat(promptIndent);
  const wrappedText = wrapBodyText(text, textColumns);
  const textRows = wrappedText.map((line, index) => ({
    backgroundColor: theme.colors.messageBackground,
    color: theme.colors.foreground,
    fillColumns: true,
    text: `${index === 0 ? promptPrefix() : continuationPrefix}${line}`
  }));

  return [
    halfLineRow(columns, LOWER_HALF_BLOCK),
    ...textRows,
    halfLineRow(columns, UPPER_HALF_BLOCK)
  ];
}

function promptPrefix(): string {
  return `${' '.repeat(USER_MESSAGE_HORIZONTAL_PADDING)}${USER_MESSAGE_PREFIX}`;
}

function halfLineRow(columns: number, glyph: string): BodyRow {
  return {
    backgroundColor: theme.colors.bodyBackground,
    color: theme.colors.messageBackground,
    text: glyph.repeat(columns)
  };
}

function colorForEntry(kind: BodyEntry['kind']): string {
  switch (kind) {
    case BodyEntryKind.Error:
      return theme.colors.errorRed;
    case BodyEntryKind.Pending:
      return theme.colors.warning;
    case BodyEntryKind.Success:
      return theme.colors.accentGreen;
    case BodyEntryKind.System:
      return theme.colors.warning;
    case BodyEntryKind.User:
      return theme.colors.foreground;
    case BodyEntryKind.Assistant:
    case BodyEntryKind.Muted:
      return theme.colors.muted;
  }
}

function labelForEntry(entry: BodyEntry): string {
  if (entry.kind === BodyEntryKind.Error) {
    return `ERROR: ${entry.text}`;
  }

  if (entry.kind === BodyEntryKind.Pending) {
    return `${entry.text} (pending)`;
  }

  return entry.text;
}

// Splits on hard line breaks (`\n`, normalizing `\r\n`/`\r` first) so multi-line
// backend output, errors, and prompts all keep their author-intended rows, then
// wraps each line to `columns`. The display sanitizer preserves `\n` as a real
// layout character, so newlines here are trusted content rather than escaped.
function wrapBodyText(text: string, columns: number): string[] {
  const wrappedRows: string[] = [];
  const hardLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of hardLines) {
    if (line.length === 0) {
      wrappedRows.push('');
      continue;
    }

    for (let start = 0; start < line.length; start += columns) {
      wrappedRows.push(line.slice(start, start + columns));
    }
  }

  return wrappedRows;
}
