import { LOWER_HALF_BLOCK, UPPER_HALF_BLOCK } from '@components/BackgroundBlock.js';
import { githubDarkTheme } from '@theme/themeConfig.js';

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

export type BodyBackgroundMode = 'disabled' | 'enabled';

export type BodyRowsOptions = {
  backgroundMode?: BodyBackgroundMode;
};

const BODY_ROW_GAP_ROWS = 1;
const ASSISTANT_MESSAGE_PREFIX = '• ';
const USER_MESSAGE_PREFIX = '❯ ';
const USER_MESSAGE_HORIZONTAL_PADDING = 2;

export function resolveBodyRows(
  entries: readonly BodyEntry[],
  columns: number,
  visibleRows: number,
  options: BodyRowsOptions = {}
): BodyRow[] {
  const fullWidthRows = toBodyRowsWithEntryGaps(entries, columns, options);
  const contentColumns = fullWidthRows.length > visibleRows ? Math.max(1, columns - 1) : columns;

  return contentColumns === columns
    ? fullWidthRows
    : toBodyRowsWithEntryGaps(entries, contentColumns, options);
}

function toBodyRowsWithEntryGaps(
  entries: readonly BodyEntry[],
  columns: number,
  options: BodyRowsOptions
): BodyRow[] {
  return entries.flatMap((entry, index) => {
    const rows = toBodyRows(entry, columns, options);

    if (index === entries.length - 1) {
      return rows;
    }

    return [...rows, ...gapRows()];
  });
}

function toBodyRows(entry: BodyEntry, columns: number, options: BodyRowsOptions): BodyRow[] {
  if (entry.kind === 'prompt') {
    return toPromptRows(entry.text, columns, options);
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
    color: githubDarkTheme.colors.foreground,
    marker: index === 0 ? ASSISTANT_MESSAGE_PREFIX : continuationPrefix,
    markerColor: index === 0 ? githubDarkTheme.colors.accentBlue : githubDarkTheme.colors.foreground,
    text: line
  }));
}

function toPromptRows(text: string, columns: number, options: BodyRowsOptions): BodyRow[] {
  const promptIndent = USER_MESSAGE_HORIZONTAL_PADDING + USER_MESSAGE_PREFIX.length;
  const textColumns = Math.max(1, columns - promptIndent - USER_MESSAGE_HORIZONTAL_PADDING);
  const continuationPrefix = ' '.repeat(promptIndent);
  const wrappedText = wrapBodyText(text, textColumns);
  const textRows = wrappedText.map((line, index) => ({
    backgroundColor:
      options.backgroundMode === 'enabled'
        ? githubDarkTheme.colors.messageBackground
        : undefined,
    color: githubDarkTheme.colors.foreground,
    fillColumns: options.backgroundMode === 'enabled',
    text: `${index === 0 ? promptPrefix() : continuationPrefix}${line}`
  }));

  if (options.backgroundMode !== 'enabled') {
    return textRows;
  }

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
    color: githubDarkTheme.colors.messageBackground,
    text: glyph.repeat(columns)
  };
}

function colorForEntry(kind: BodyEntry['kind']): string {
  switch (kind) {
    case 'error':
      return githubDarkTheme.colors.errorRed;
    case 'pending':
      return githubDarkTheme.colors.warning;
    case 'success':
      return githubDarkTheme.colors.accentGreen;
    case 'prompt':
      return githubDarkTheme.colors.foreground;
    case 'info':
      return githubDarkTheme.colors.muted;
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

function wrapBodyText(text: string, columns: number): string[] {
  const singleLine = fitBodyLine(text);

  if (singleLine.length === 0) {
    return [''];
  }

  const wrappedRows: string[] = [];

  for (let start = 0; start < singleLine.length; start += columns) {
    wrappedRows.push(singleLine.slice(start, start + columns));
  }

  return wrappedRows;
}

function gapRows(): BodyRow[] {
  return Array.from({ length: BODY_ROW_GAP_ROWS }, () => ({
    color: githubDarkTheme.colors.muted,
    text: ''
  }));
}
