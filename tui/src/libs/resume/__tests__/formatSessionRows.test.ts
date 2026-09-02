import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { SESSION_STATUS_CURRENT, SESSION_STATUS_IDLE } from '@contracts/backend/index.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { formatResumeHeader, formatResumeRow, resumeFolderContentWidth } from '@libs/resume/formatSessionRows.ts';

const NOW = Date.UTC(2026, 6, 10, 3, 0, 0);
const COLUMNS = 96;
const HOME_DIR = 'C:\\Users\\kefeiqian';

function session(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    sessionId: 'session-1',
    summary: 'Summary',
    status: SESSION_STATUS_IDLE,
    modifiedAt: NOW - 5 * 60_000,
    createdAt: NOW - 2 * 60 * 60_000,
    folder: 'C:\\Users\\kefeiqian\\Projects\\KQode',
    ...overrides
  };
}

function columnStart(line: string, label: string): number {
  const index = line.indexOf(label);
  expect(index).toBeGreaterThanOrEqual(0);
  return displayWidth(line.slice(0, index));
}

function statusStart(line: string): number {
  return line.includes(SESSION_STATUS_CURRENT)
    ? columnStart(line, SESSION_STATUS_CURRENT)
    : columnStart(line, SESSION_STATUS_IDLE);
}

function folderWidthFor(...sessions: SessionSummary[]): number {
  return resumeFolderContentWidth(sessions, HOME_DIR);
}

describe('formatSessionRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aligns cells with the header across differing row content', () => {
    const sessions = [
      session({ summary: 'Short', status: SESSION_STATUS_CURRENT, folder: 'C:\\repo' }),
      session({ summary: 'A much longer summary value', folder: 'C:\\repo\\deep\\leaf' }),
      session({ summary: 'Tabs\tand\nnewlines', folder: 'C:\\other' })
    ];
    const folderWidth = folderWidthFor(...sessions);
    const header = formatResumeHeader(COLUMNS, folderWidth);
    const rows = sessions.map((entry, index) =>
      formatResumeRow(entry, index, COLUMNS, HOME_DIR, folderWidth)
    );

    for (const row of rows) {
      expect(statusStart(row)).toBe(columnStart(header, 'Status'));
      expect(columnStart(row, '5m ago')).toBe(columnStart(header, 'Modified'));
      expect(columnStart(row, '2h ago')).toBe(columnStart(header, 'Created'));
    }
  });

  it('keeps following columns aligned after truncating a long summary', () => {
    const entry = session({ summary: 'This summary is intentionally far too long for its column' });
    const folderWidth = folderWidthFor(entry);
    const header = formatResumeHeader(72, folderWidth);
    const row = formatResumeRow(entry, 0, 72, HOME_DIR, folderWidth);

    expect(row).toContain('…');
    expect(columnStart(row, 'Idle')).toBe(columnStart(header, 'Status'));
    expect(columnStart(row, '5m ago')).toBe(columnStart(header, 'Modified'));
  });

  it('measures wide glyphs by display width when aligning columns', () => {
    const entry = session({ summary: '修复表格 😀 columns' });
    const folderWidth = folderWidthFor(entry);
    const header = formatResumeHeader(COLUMNS, folderWidth);
    const row = formatResumeRow(entry, 0, COLUMNS, HOME_DIR, folderWidth);

    expect(columnStart(row, 'Idle')).toBe(columnStart(header, 'Status'));
    expect(columnStart(row, '5m ago')).toBe(columnStart(header, 'Modified'));
  });

  it('clips rows to the requested safe width on narrow terminals', () => {
    const entry = session({ summary: 'Long summary', folder: 'C:\\very\\long\\folder' });
    const row = formatResumeRow(entry, 0, 32, HOME_DIR, folderWidthFor(entry));

    expect(displayWidth(row)).toBeLessThanOrEqual(32);
    expect(row).toContain('Idle');
  });

  it('shows the full home-relative folder when the column has room', () => {
    const entry = session({
      folder: 'C:\\Users\\kefeiqian\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace'
    });
    const row = formatResumeRow(entry, 0, 140, HOME_DIR, folderWidthFor(entry));

    expect(row).toContain('~\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace');
    expect(row).not.toContain('\\...\\');
  });

  it('collapses the folder middle only when the column is too narrow', () => {
    const entry = session({
      folder: 'C:\\Users\\kefeiqian\\Projects\\KQode\\target\\kqode-test-workspaces\\workspace'
    });
    const row = formatResumeRow(entry, 0, 72, HOME_DIR, folderWidthFor(entry));

    expect(row).toContain('~\\...\\workspace');
  });
});
