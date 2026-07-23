import { describe, expect, it } from 'vitest';
import type { GitStatus } from '@contracts/backend/index.ts';
import {
  countCwdRows,
  formatCwdLine,
  pullRequestLabelOffset,
  renderCwdLine
} from '@libs/tui/cwdLine.ts';

describe('formatCwdLine', () => {
  it('joins the cwd and git status as plain text', () => {
    expect(formatCwdLine('/tmp/x', { label: '⎇ main*' })).toContain('/tmp/x [⎇ main*]');
  });

  it('appends the pull-request label as plain text', () => {
    expect(formatCwdLine('/tmp/x', { label: '⎇ main*', pullRequestLabel: '#3' })).toBe(
      '/tmp/x [⎇ main*] [#3]'
    );
  });

  it('sanitizes terminal controls from the cwd and git status', () => {
    expect(
      formatCwdLine('/tmp/\u001B[31mx', {
        label: '⎇ main\u0007',
        pullRequestLabel: '#3\u001B'
      })
    ).toBe('/tmp/\\x1b[31mx [⎇ main\\x07] [#3\\x1b]');
  });

  it('renders the pull-request label as a hyperlink when a url is present', () => {
    expect(
      renderCwdLine('/tmp/x', {
        label: '⎇ main*',
        pullRequestLabel: '#3',
        pullRequestUrl: 'https://github.com/o/r/pull/3'
      })
    ).toContain(
      '\u001B]8;;https://github.com/o/r/pull/3\u0007\u001B[4m\u001B[4:3m#3\u001B[24m'
    );
  });

  it('escapes tabs and newlines so the cwd remains one logical row', () => {
    expect(formatCwdLine('/tmp/a\nb', { label: '⎇ main\tbad' })).toBe(
      '/tmp/a\\x0ab [⎇ main\\x09bad]'
    );
    expect(countCwdRows('/tmp/a\nb', undefined, 80)).toBe(1);
  });
});

describe('countCwdRows', () => {
  it('uses terminal display width for wide glyphs', () => {
    expect(countCwdRows('/界界', undefined, 4)).toBe(2);
  });
});

describe('pullRequestLabelOffset', () => {
  it('returns the display-column offset for the pull-request label', () => {
    const gitStatus: GitStatus = { label: '⎇ 主', pullRequestLabel: '#3' };

    expect(pullRequestLabelOffset('/界', gitStatus)).toBe(12);
  });
});
