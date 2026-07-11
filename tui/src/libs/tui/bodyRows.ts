import {
  LOWER_HALF_BLOCK,
  UPPER_HALF_BLOCK
} from '@libs/tui/backgroundBlock.ts';
import { BodyEntryKind } from '@constants/bodyEntry.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';
import type {
  RenderedStyledSegment,
  StyledSegment,
  ThemeColorToken
} from '@libs/markdown/types.ts';
import { renderMarkdownContentRows } from '@libs/markdown/renderBlocks.ts';

export type BodyEntry = {
  id?: string;
  kind: BodyEntryKind;
  text: string;
};

export type BodyRow = {
  backgroundColor?: string;
  color?: string;
  continuesPrevious?: boolean;
  fillColumns?: boolean;
  marker?: string;
  markerColor?: string;
  segments?: RenderedStyledSegment[];
  text: string;
};

// Theme-free structural row: caches text/marker/fill plus semantic color TOKEN
// names (not resolved colors), so wrapping is memoized once while the active
// theme's colors are applied on top per render (see `resolveBodyRows`).
export type BodyRowStructure = {
  backgroundColorToken?: ThemeColorToken;
  colorToken?: ThemeColorToken;
  continuesPrevious?: boolean;
  fillColumns?: boolean;
  marker?: string;
  markerColorToken?: ThemeColorToken;
  segments?: StyledSegment[];
  text: string;
};

export const DEFAULT_BODY_ENTRIES: readonly BodyEntry[] = [];

const ASSISTANT_MESSAGE_PREFIX = '• ';
const USER_MESSAGE_PREFIX = '❯ ';
const USER_MESSAGE_HORIZONTAL_PADDING = 2;

/**
 * Wraps `entries` into rendered rows for the active `theme`. Text wrapping is
 * cached per entry + width (theme-free); the active theme's colors are applied
 * on top per call, so switching themes never returns stale cached colors.
 */
export function resolveBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number,
  theme: ThemeDefinition
): BodyRow[] {
  return structuralBodyRows(entries, columns, visibleRows).map((row) => applyTheme(row, theme));
}

export function countBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number
): number {
  return structuralBodyRows(entries, Math.max(1, columns), Math.max(1, visibleRows)).length;
}

// Wrapping and row count are theme-independent, so this is shared by
// `resolveBodyRows` (which then applies colors) and `countBodyRows`.
function structuralBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number
): BodyRowStructure[] {
  const fullWidthRows = toBodyRowsWithEntryGaps(entries, columns);
  // If content overflows vertically, reserve the final terminal column for the
  // scrollbar and re-wrap text so body rows do not collide with it.
  const contentColumns = fullWidthRows.length > visibleRows ? Math.max(1, columns - 1) : columns;

  return contentColumns === columns
    ? fullWidthRows
    : toBodyRowsWithEntryGaps(entries, contentColumns);
}

function applyTheme(row: BodyRowStructure, theme: ThemeDefinition): BodyRow {
  return {
    backgroundColor:
      row.backgroundColorToken === undefined ? undefined : theme.colors[row.backgroundColorToken],
    color: row.colorToken === undefined ? undefined : theme.colors[row.colorToken],
    continuesPrevious: row.continuesPrevious,
    fillColumns: row.fillColumns,
    marker: row.marker,
    markerColor:
      row.markerColorToken === undefined ? undefined : theme.colors[row.markerColorToken],
    segments: row.segments?.map((segment) => ({
      ...segment,
      backgroundColor:
        segment.backgroundColorToken === undefined
          ? undefined
          : theme.colors[segment.backgroundColorToken],
      color: segment.colorToken === undefined ? undefined : theme.colors[segment.colorToken]
    })),
    text: row.text
  };
}

function toBodyRowsWithEntryGaps(
  entries: readonly BodyEntry[],
  columns: number
): BodyRowStructure[] {
  return entries.flatMap((entry) => toBodyRows(entry, columns));
}

// Wrapping a `BodyEntry` depends only on its immutable kind/text and the column
// width, so memoize the structural rows per entry identity and width. During
// streaming only the changed entry is a fresh object (new identity), so the rest
// of the transcript hits the cache instead of re-wrapping on every token/render;
// resizes and scrolls reuse it too. Entries are GC'd from the WeakMap once the
// transcript drops them (e.g. on `/clear`). The cache is theme-safe: it stores
// color TOKEN names, not resolved colors, so a theme switch reuses the cache and
// re-resolves colors (see `applyTheme`).
const MAX_CACHED_WIDTHS = 4;
const bodyRowsByEntry = new WeakMap<BodyEntry, Map<number, BodyRowStructure[]>>();

function toBodyRows(entry: BodyEntry, columns: number): BodyRowStructure[] {
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

function computeBodyRows(entry: BodyEntry, columns: number): BodyRowStructure[] {
  if (entry.kind === BodyEntryKind.User) {
    return toPromptRows(entry.text, columns);
  }

  if (entry.kind === BodyEntryKind.Assistant) {
    return toAssistantRows(entry.text, columns, entry.id?.startsWith('stream-') === true);
  }

  return wrapBodyLines(labelForEntry(entry), columns).map((line) => ({
    colorToken: colorTokenForEntry(entry.kind),
    continuesPrevious: line.continuesPrevious,
    text: line.text
  }));
}

function toAssistantRows(text: string, columns: number, streaming = false): BodyRowStructure[] {
  const continuationPrefix = ' '.repeat(ASSISTANT_MESSAGE_PREFIX.length);
  const contentColumns = Math.max(1, columns - ASSISTANT_MESSAGE_PREFIX.length);

  try {
    return renderMarkdownContentRows(text, contentColumns, { streaming }).map(
      (row, index): BodyRowStructure => ({
        ...row,
        colorToken: row.colorToken ?? 'foreground',
        marker: index === 0 ? ASSISTANT_MESSAGE_PREFIX : continuationPrefix,
        markerColorToken: index === 0 ? 'accentBlue' : 'foreground'
      })
    );
  } catch {
    // Fail safe: markdown parsing must never break transcript rendering.
  }

  const wrappedText = wrapBodyLines(text, contentColumns);

  return wrappedText.map((line, index): BodyRowStructure => ({
    colorToken: 'foreground',
    continuesPrevious: line.continuesPrevious,
    marker: index === 0 ? ASSISTANT_MESSAGE_PREFIX : continuationPrefix,
    markerColorToken: index === 0 ? 'accentBlue' : 'foreground',
    segments: [{ colorToken: 'foreground', text: line.text }],
    text: line.text
  }));
}

function toPromptRows(text: string, columns: number): BodyRowStructure[] {
  const promptIndent = USER_MESSAGE_HORIZONTAL_PADDING + USER_MESSAGE_PREFIX.length;
  // User prompts have symmetric horizontal padding inside their message block;
  // continuation rows replace the visible prefix with spaces to align wrapped text.
  const textColumns = Math.max(1, columns - promptIndent - USER_MESSAGE_HORIZONTAL_PADDING);
  const continuationPrefix = ' '.repeat(promptIndent);
  const wrappedText = wrapBodyLines(text, textColumns);
  const textRows = wrappedText.map((line, index): BodyRowStructure => ({
    backgroundColorToken: 'messageBackground',
    colorToken: 'foreground',
    continuesPrevious: line.continuesPrevious,
    fillColumns: true,
    text: `${index === 0 ? promptPrefix() : continuationPrefix}${line.text}`
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

function halfLineRow(columns: number, glyph: string): BodyRowStructure {
  return {
    backgroundColorToken: 'bodyBackground',
    colorToken: 'messageBackground',
    text: glyph.repeat(columns)
  };
}

function colorTokenForEntry(kind: BodyEntry['kind']): ThemeColorToken {
  switch (kind) {
    case BodyEntryKind.Error:
      return 'errorRed';
    case BodyEntryKind.Pending:
      return 'warning';
    case BodyEntryKind.Success:
      return 'accentGreen';
    case BodyEntryKind.System:
      return 'warning';
    case BodyEntryKind.User:
      return 'foreground';
    case BodyEntryKind.Assistant:
    case BodyEntryKind.Muted:
      return 'muted';
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

type WrappedBodyLine = { text: string; continuesPrevious: boolean };

// Splits on hard line breaks (`\n`, normalizing `\r\n`/`\r` first) so multi-line
// backend output, errors, and prompts all keep their author-intended rows, then
// wraps each line to `columns`. `continuesPrevious` marks the soft-wrap slices
// (every slice after the first within one hard line) so copy/selection can
// rejoin a wrapped logical line while hard line breaks start a fresh line. The
// display sanitizer preserves `\n` as a real layout character, so newlines here
// are trusted content rather than escaped.
function wrapBodyLines(text: string, columns: number): WrappedBodyLine[] {
  const wrapped: WrappedBodyLine[] = [];
  const hardLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of hardLines) {
    if (line.length === 0) {
      wrapped.push({ text: '', continuesPrevious: false });
      continue;
    }

    for (let start = 0; start < line.length; start += columns) {
      wrapped.push({ text: line.slice(start, start + columns), continuesPrevious: start > 0 });
    }
  }

  return wrapped;
}
