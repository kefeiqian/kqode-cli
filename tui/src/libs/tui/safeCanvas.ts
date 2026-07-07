/** Resolves a rendered row count by reserving physical guard rows. */
export function resolveSafeRows(rows: number, guardRows: number, minimumRows: number): number {
  return Math.max(minimumRows, rows - guardRows);
}

/** Resolves a content width by reserving physical guard columns. */
export function resolveSafeColumns(columns: number, guardColumns: number, minimumColumns = 1): number {
  return Math.max(minimumColumns, columns - guardColumns);
}

/** Resolves the editable composer width inside a safe chrome row. */
export function resolveComposerInputColumns(chromeColumns: number, promptPrefixColumns: number): number {
  return Math.max(1, chromeColumns - promptPrefixColumns);
}

export function isInsideSafeChromeBounds({
  column,
  columns,
  row,
  rows
}: {
  column: number;
  columns: number;
  row: number;
  rows: number;
}): boolean {
  return row >= 1 && row <= rows && column >= 1 && column <= columns;
}
