import type { MemoryInboxEntry } from '@contracts/backend/index.ts';
import { formatConfidence, pad, truncate } from '@libs/memory/rowLayout.ts';

const RANK_WIDTH = 4;
const STATUS_WIDTH = 12;
const TYPE_WIDTH = 9;
const CONF_WIDTH = 5;
const GUTTER = 2;
const MIN_TITLE_WIDTH = 12;

/** Header row for the inbox table. */
export function formatInboxHeader(columns: number): string {
  return formatLine(columns, '#', 'Status', 'Type', 'Conf', 'Title');
}

/** One inbox row: rank, review status, type, confidence, title. */
export function formatInboxRow(entry: MemoryInboxEntry, index: number, columns: number): string {
  return formatLine(
    columns,
    `${index + 1}.`,
    entry.status,
    entry.memoryType ?? '—',
    formatConfidence(entry.confidence),
    entry.title ?? '—'
  );
}

function formatLine(
  columns: number,
  rank: string,
  status: string,
  type: string,
  confidence: string,
  title: string
): string {
  const safeColumns = Math.max(1, columns);
  const fixedWidth = RANK_WIDTH + STATUS_WIDTH + TYPE_WIDTH + CONF_WIDTH + GUTTER * 4;
  const titleWidth = Math.max(MIN_TITLE_WIDTH, safeColumns - fixedWidth);
  const row = [
    pad(truncate(rank, RANK_WIDTH), RANK_WIDTH),
    pad(truncate(status, STATUS_WIDTH), STATUS_WIDTH),
    pad(truncate(type, TYPE_WIDTH), TYPE_WIDTH),
    pad(truncate(confidence, CONF_WIDTH), CONF_WIDTH),
    pad(truncate(title, titleWidth), titleWidth)
  ].join(' '.repeat(GUTTER));
  return truncate(row, safeColumns);
}
