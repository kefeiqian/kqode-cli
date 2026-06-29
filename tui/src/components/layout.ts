export const DEFAULT_COLUMNS = 80;
export const DEFAULT_ROWS = 24;
export const MIN_ROWS = 10;
export const HIDE_HEADER_BELOW_COLUMNS = 36;
export const COMPACT_HEADER_BELOW_COLUMNS = 52;
export const DEFAULT_COMPOSER_VISIBLE_LINES = 3;

export function headerRowCount(columns: number): number {
  if (columns < HIDE_HEADER_BELOW_COLUMNS) {
    return 0;
  }

  if (columns < COMPACT_HEADER_BELOW_COLUMNS) {
    return 1;
  }

  return 1;
}
