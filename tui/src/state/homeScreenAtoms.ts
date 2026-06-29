import { atom } from 'jotai';
import { countBodyRows, DEFAULT_BODY_ENTRIES } from '@libs/tui/bodyRows.js';
import type { BodyEntry } from '@libs/tui/bodyRows.js';
import { countCwdRows } from '@libs/tui/cwdLine.js';
import { DEFAULT_COLUMNS, DEFAULT_ROWS, headerRowCount } from '@libs/tui/layout.js';

export type HomeScreenConfig = {
  productVersion: string;
  workspaceCwd: string;
  gitStatusLabel?: string;
  modelLabel: string;
  bodyEntries?: readonly BodyEntry[];
  columns: number;
  rows: number;
  onPromptSubmit: (prompt: string) => void;
};

export type HomeScreenOptions = {
  productVersion: string;
  workspaceCwd: string;
  gitStatusLabel?: string;
  modelLabel?: string;
  bodyEntries?: readonly BodyEntry[];
  columns?: number;
  rows?: number;
  onPromptSubmit?: (prompt: string) => void;
};

export const DEFAULT_MODEL_LABEL = 'GPT-5.5';
export const DEFAULT_COMPOSER_ROWS = 3;
export const BODY_CWD_GAP_ROWS = 1;

const COMPOSER_BACKGROUND_PADDING_ROWS = 2;
const COMPOSER_ERROR_RESERVE_ROWS = 1;

export const noopPromptSubmit = () => {};

export function createHomeScreenConfig({
  productVersion,
  workspaceCwd,
  gitStatusLabel,
  modelLabel = DEFAULT_MODEL_LABEL,
  bodyEntries,
  columns = DEFAULT_COLUMNS,
  rows = DEFAULT_ROWS,
  onPromptSubmit = noopPromptSubmit
}: HomeScreenOptions): HomeScreenConfig {
  return {
    productVersion,
    workspaceCwd,
    gitStatusLabel,
    modelLabel,
    bodyEntries,
    columns,
    rows,
    onPromptSubmit
  };
}

export const homeScreenConfigAtom = atom<HomeScreenConfig>({
  productVersion: '',
  workspaceCwd: '',
  modelLabel: DEFAULT_MODEL_LABEL,
  columns: DEFAULT_COLUMNS,
  rows: DEFAULT_ROWS,
  onPromptSubmit: noopPromptSubmit
});

export const bodyScrollOffsetRowsAtom = atom(0);
export const composerRowsAtom = atom(DEFAULT_COMPOSER_ROWS);
export const submittedPromptEntriesAtom = atom<BodyEntry[]>([]);

export const displayedBodyEntriesAtom = atom((get) => {
  const config = get(homeScreenConfigAtom);
  const submittedPromptEntries = get(submittedPromptEntriesAtom);
  const baseBodyEntries = config.bodyEntries ?? DEFAULT_BODY_ENTRIES;

  return submittedPromptEntries.length === 0
    ? config.bodyEntries ?? DEFAULT_BODY_ENTRIES
    : [...baseBodyEntries, ...submittedPromptEntries];
});

export const layoutAtom = atom((get) => {
  const config = get(homeScreenConfigAtom);
  const composerRows = get(composerRowsAtom);
  const displayedBodyEntries = get(displayedBodyEntriesAtom);
  const bodyEntryRows = countBodyRows(displayedBodyEntries, config.columns, config.rows);

  return resolveHomeScreenLayout(
    config.columns,
    config.rows,
    bodyEntryRows,
    composerRows,
    countCwdRows(config.workspaceCwd, config.gitStatusLabel, config.columns)
  );
});

export const maxBodyScrollOffsetRowsAtom = atom((get) => {
  const config = get(homeScreenConfigAtom);
  const layout = get(layoutAtom);
  const bodyRowsForScroll = countBodyRows(get(displayedBodyEntriesAtom), config.columns, layout.bodyRows);

  return Math.max(0, bodyRowsForScroll - layout.bodyRows);
});

export const bottomSpacerRowsAtom = atom((get) => {
  const config = get(homeScreenConfigAtom);
  const layout = get(layoutAtom);
  const composerRows = get(composerRowsAtom);
  // Keep cwd/composer/status pinned to the bottom by giving every spare row to
  // the body-to-cwd spacer instead of allowing the body to push the prompt down.
  return Math.max(
    0,
    config.rows -
      headerRowCount(config.columns) -
      layout.bodyRows -
      BODY_CWD_GAP_ROWS -
    layout.cwdRows -
      composerRows -
      1
  );
});

export const composerTopAtom = atom((get) => {
  const config = get(homeScreenConfigAtom);
  const composerRows = get(composerRowsAtom);
  // `rows` is a count while Ink cursor coordinates are zero-based; subtract the
  // status row plus the composer height to get the first composer text row.
  return config.rows - 1 - composerRows;
});

export const submitPromptAtom = atom(null, (get, set, prompt: string) => {
  const config = get(homeScreenConfigAtom);
  set(submittedPromptEntriesAtom, (current) => [...current, { kind: 'prompt', text: prompt }]);
  set(bodyScrollOffsetRowsAtom, 0);
  config.onPromptSubmit(prompt);
});

export const scrollBodyByRowsAtom = atom(null, (get, set, deltaRows: number) => {
  const maxBodyScrollOffsetRows = get(maxBodyScrollOffsetRowsAtom);
  set(bodyScrollOffsetRowsAtom, (current) =>
    Math.min(maxBodyScrollOffsetRows, Math.max(0, current + deltaRows))
  );
});

export function resolveHomeScreenLayout(
  columns: number,
  rows: number,
  bodyEntryCount = Number.POSITIVE_INFINITY,
  composerRows = DEFAULT_COMPOSER_ROWS,
  cwdRows = 1
): { bodyRows: number; composerVisibleRows: number; cwdRows: number } {
  const headerRows = headerRowCount(columns);
  const resolvedCwdRows = Math.max(1, cwdRows);
  const statusRows = 1;
  const composerErrorReserveRows = COMPOSER_ERROR_RESERVE_ROWS;
  const minBodyRows = 1;
  // Fixed rows exclude the composer because it grows with wrapping/validation;
  // reserving one possible error row keeps the body from collapsing below 1 row.
  const fixedRows = headerRows + BODY_CWD_GAP_ROWS + resolvedCwdRows + statusRows;
  const maxComposerVisibleRows = Math.max(
    1,
    rows - fixedRows - COMPOSER_BACKGROUND_PADDING_ROWS - composerErrorReserveRows - minBodyRows
  );
  const maxBodyRows = rows - fixedRows - composerRows;

  return {
    bodyRows: Math.max(1, Math.min(maxBodyRows, bodyEntryCount + 1)),
    composerVisibleRows: maxComposerVisibleRows,
    cwdRows: resolvedCwdRows
  };
}
