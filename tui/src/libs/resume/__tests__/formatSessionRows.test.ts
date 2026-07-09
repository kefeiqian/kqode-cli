import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { SESSION_STATUS_CURRENT, SESSION_STATUS_IDLE } from '@contracts/backend/index.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { formatResumeHeader, formatResumeRow } from '@libs/resume/formatSessionRows.ts';

const NOW = Date.UTC(2026, 6, 10, 3, 0, 0);
const COLUMNS = 96;

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

describe('formatSessionRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aligns cells with the header across differing row content', () => {
    const header = formatResumeHeader(COLUMNS);
    const rows = [
      formatResumeRow(session({ summary: 'Short', status: SESSION_STATUS_CURRENT, folder: 'C:\\repo' }), 0, COLUMNS),
      formatResumeRow(session({ summary: 'A much longer summary value', folder: 'C:\\repo\\deep\\leaf' }), 1, COLUMNS),
      formatResumeRow(session({ summary: 'Tabs\tand\nnewlines', folder: 'C:\\other' }), 2, COLUMNS)
    ];

    for (const row of rows) {
      expect(statusStart(row)).toBe(columnStart(header, 'Status'));
      expect(columnStart(row, '5m ago')).toBe(columnStart(header, 'Modified'));
      expect(columnStart(row, '2h ago')).toBe(columnStart(header, 'Created'));
    }
  });

  it('keeps following columns aligned after truncating a long summary', () => {
    const header = formatResumeHeader(72);
    const row = formatResumeRow(
      session({ summary: 'This summary is intentionally far too long for its column' }),
      0,
      72
    );

    expect(row).toContain('…');
    expect(columnStart(row, 'Idle')).toBe(columnStart(header, 'Status'));
    expect(columnStart(row, '5m ago')).toBe(columnStart(header, 'Modified'));
  });

  it('measures wide glyphs by display width when aligning columns', () => {
    const header = formatResumeHeader(COLUMNS);
    const row = formatResumeRow(session({ summary: '修复表格 😀 columns' }), 0, COLUMNS);

    expect(columnStart(row, 'Idle')).toBe(columnStart(header, 'Status'));
    expect(columnStart(row, '5m ago')).toBe(columnStart(header, 'Modified'));
  });

  it('clips rows to the requested safe width on narrow terminals', () => {
    const row = formatResumeRow(session({ summary: 'Long summary', folder: 'C:\\very\\long\\folder' }), 0, 32);

    expect(displayWidth(row)).toBeLessThanOrEqual(32);
    expect(row).toContain('Idle');
  });
});
