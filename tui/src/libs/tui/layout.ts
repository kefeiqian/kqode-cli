import { COMPACT_HEADER_BELOW_COLUMNS, HIDE_HEADER_BELOW_COLUMNS } from '@constants/ui.ts';

export function headerRowCount(columns: number): number {
  if (columns < HIDE_HEADER_BELOW_COLUMNS) {
    return 0;
  }

  if (columns < COMPACT_HEADER_BELOW_COLUMNS) {
    return 1;
  }

  return 1;
}
