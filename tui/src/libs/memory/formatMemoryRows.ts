import type { MemoryItem } from '@contracts/backend/index.ts';
import { formatAge, pad, truncate } from '@libs/memory/rowLayout.ts';

const RANK_WIDTH = 4;
const SCOPE_WIDTH = 8;
const TYPE_WIDTH = 9;
const UPDATED_WIDTH = 8;
const GUTTER = 2;
const MIN_TITLE_WIDTH = 12;

/** Header row for the active-memory table. */
export function formatMemoryHeader(columns: number): string {
  return formatLine(columns, '#', 'Scope', 'Type', 'Title', 'Updated');
}

/** One active-memory row: rank, scope, type, title, relative updated time. */
export function formatMemoryRow(item: MemoryItem, index: number, columns: number): string {
  return formatLine(
    columns,
    `${index + 1}.`,
    item.scope,
    item.memoryType,
    item.title,
    formatAge(item.updatedAt)
  );
}

function formatLine(
  columns: number,
  rank: string,
  scope: string,
  type: string,
  title: string,
  updated: string
): string {
  const safeColumns = Math.max(1, columns);
  const fixedWidth = RANK_WIDTH + SCOPE_WIDTH + TYPE_WIDTH + UPDATED_WIDTH + GUTTER * 4;
  const titleWidth = Math.max(MIN_TITLE_WIDTH, safeColumns - fixedWidth);
  const row = [
    pad(truncate(rank, RANK_WIDTH), RANK_WIDTH),
    pad(truncate(scope, SCOPE_WIDTH), SCOPE_WIDTH),
    pad(truncate(type, TYPE_WIDTH), TYPE_WIDTH),
    pad(truncate(title, titleWidth), titleWidth),
    pad(truncate(updated, UPDATED_WIDTH), UPDATED_WIDTH)
  ].join(' '.repeat(GUTTER));
  return truncate(row, safeColumns);
}
