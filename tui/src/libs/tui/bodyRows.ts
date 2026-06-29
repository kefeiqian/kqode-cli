import {
  LOWER_HALF_BLOCK,
  UPPER_HALF_BLOCK
} from '@libs/tui/backgroundBlock.js';
import { geminiDarkTheme } from '@theme/themeConfig.js';

export type BodyEntry = {
  id?: string;
  kind: 'info' | 'prompt' | 'pending' | 'success' | 'error';
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

function toBodyRows(entry: BodyEntry, columns: number): BodyRow[] {
  if (entry.kind === 'prompt') {
    return toPromptRows(entry.text, columns);
  }

  if (entry.kind === 'info') {
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
    color: geminiDarkTheme.colors.foreground,
    marker: index === 0 ? ASSISTANT_MESSAGE_PREFIX : continuationPrefix,
    markerColor: index === 0 ? geminiDarkTheme.colors.accentBlue : geminiDarkTheme.colors.foreground,
    text: line
  }));
}

function toPromptRows(text: string, columns: number): BodyRow[] {
  const promptIndent = USER_MESSAGE_HORIZONTAL_PADDING + USER_MESSAGE_PREFIX.length;
  // User prompts have symmetric horizontal padding inside their message block;
  // continuation rows replace the visible prefix with spaces to align wrapped text.
  const textColumns = Math.max(1, columns - promptIndent - USER_MESSAGE_HORIZONTAL_PADDING);
  const continuationPrefix = ' '.repeat(promptIndent);
  const wrappedText = wrapBodyText(text, textColumns, { preserveHardLines: true });
  const textRows = wrappedText.map((line, index) => ({
    backgroundColor: geminiDarkTheme.colors.messageBackground,
    color: geminiDarkTheme.colors.foreground,
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
    backgroundColor: geminiDarkTheme.colors.bodyBackground,
    color: geminiDarkTheme.colors.messageBackground,
    text: glyph.repeat(columns)
  };
}

function colorForEntry(kind: BodyEntry['kind']): string {
  switch (kind) {
    case 'error':
      return geminiDarkTheme.colors.errorRed;
    case 'pending':
      return geminiDarkTheme.colors.warning;
    case 'success':
      return geminiDarkTheme.colors.accentGreen;
    case 'prompt':
      return geminiDarkTheme.colors.foreground;
    case 'info':
      return geminiDarkTheme.colors.muted;
  }
}

function labelForEntry(entry: BodyEntry): string {
  if (entry.kind === 'error') {
    return `ERROR: ${entry.text}`;
  }

  if (entry.kind === 'pending') {
    return `${entry.text} (pending)`;
  }

  return entry.text;
}

function fitBodyLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

function wrapBodyText(
  text: string,
  columns: number,
  options: { preserveHardLines?: boolean } = {}
): string[] {
  const wrappedRows: string[] = [];
  const hardLines = options.preserveHardLines
    ? text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    : [fitBodyLine(text)];

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
