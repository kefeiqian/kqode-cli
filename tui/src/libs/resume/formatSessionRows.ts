import type { SessionSummary } from '@contracts/backend/index.ts';

const STATUS_WIDTH = 8;
const MODIFIED_WIDTH = 8;
const CREATED_WIDTH = 8;
const RANK_WIDTH = 4;
const GUTTER = 2;
const MIN_SUMMARY_WIDTH = 12;
const MIN_FOLDER_WIDTH = 10;

export function formatResumeHeader(columns: number): string {
  return formatLine(columns, '#', 'Summary', 'Status', 'Modified', 'Created', 'Folder');
}

export function formatResumeRow(
  session: SessionSummary,
  index: number,
  columns: number
): string {
  return formatLine(
    columns,
    `${index + 1}.`,
    session.summary,
    session.status,
    formatAge(session.modifiedAt),
    formatAge(session.createdAt),
    session.folder
  );
}

function formatLine(
  columns: number,
  rank: string,
  summary: string,
  status: string,
  modified: string,
  created: string,
  folder: string
): string {
  const safeColumns = Math.max(1, columns);
  const fixedWidth =
    RANK_WIDTH + STATUS_WIDTH + MODIFIED_WIDTH + CREATED_WIDTH + GUTTER * 5 + MIN_FOLDER_WIDTH;
  const summaryWidth = Math.max(MIN_SUMMARY_WIDTH, safeColumns - fixedWidth);
  const folderWidth = Math.max(
    MIN_FOLDER_WIDTH,
    safeColumns -
      (RANK_WIDTH + summaryWidth + STATUS_WIDTH + MODIFIED_WIDTH + CREATED_WIDTH + GUTTER * 5)
  );
  const row = [
    pad(truncate(rank, RANK_WIDTH), RANK_WIDTH),
    pad(truncate(summary, summaryWidth), summaryWidth),
    pad(truncate(status, STATUS_WIDTH), STATUS_WIDTH),
    pad(truncate(modified, MODIFIED_WIDTH), MODIFIED_WIDTH),
    pad(truncate(created, CREATED_WIDTH), CREATED_WIDTH),
    pad(truncate(folder, folderWidth), folderWidth)
  ].join(' '.repeat(GUTTER));
  return truncate(row, safeColumns);
}

function formatAge(timestampMs: number): string {
  const deltaMs = Math.max(0, Date.now() - timestampMs);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function truncate(text: string, width: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= width) {
    return normalized;
  }
  if (width <= 1) {
    return normalized.slice(0, width);
  }
  return `${normalized.slice(0, width - 1)}…`;
}

function pad(text: string, width: number): string {
  return text.padEnd(width, ' ');
}
