import { describe, expect, it } from 'vitest';
import type { GitStatus } from '@contracts/backend/index.ts';
import { pullRequestLabelOffset } from '@libs/tui/cwdLine.ts';
import { resolvePullRequestClickTarget } from '@libs/tui/pullRequestClick.ts';

const url = 'https://github.com/o/r/pull/3';
const workspaceCwd = '/tmp/proj';
const gitStatus: GitStatus = { label: '⎇ main', pullRequestLabel: '#3', pullRequestUrl: url };

// The cwd line renders one row directly above the composer at a wide width, so
// its 0-based row is composerTop - 1 (1-based SGR row = composerTop).
const composerTop = 12;
const singleRow = { composerTop, cwdRows: 1, columns: 200, workspaceCwd, gitStatus };
const labelStart = pullRequestLabelOffset(workspaceCwd, gitStatus) ?? -1;

describe('resolvePullRequestClickTarget', () => {
  it('returns the url for a click on the first character of the label', () => {
    expect(
      resolvePullRequestClickTarget({ ...singleRow, clickRow: composerTop, clickColumn: labelStart + 1 })
    ).toBe(url);
  });

  it('returns the url for a click on the last character of the label', () => {
    expect(
      resolvePullRequestClickTarget({
        ...singleRow,
        clickRow: composerTop,
        clickColumn: labelStart + gitStatus.pullRequestLabel!.length
      })
    ).toBe(url);
  });

  it('misses the opening bracket just before the label', () => {
    expect(
      resolvePullRequestClickTarget({ ...singleRow, clickRow: composerTop, clickColumn: labelStart })
    ).toBeUndefined();
  });

  it('misses the closing bracket just after the label', () => {
    expect(
      resolvePullRequestClickTarget({
        ...singleRow,
        clickRow: composerTop,
        clickColumn: labelStart + gitStatus.pullRequestLabel!.length + 1
      })
    ).toBeUndefined();
  });

  it('misses a click on the composer row below the cwd line', () => {
    expect(
      resolvePullRequestClickTarget({ ...singleRow, clickRow: composerTop + 1, clickColumn: labelStart + 1 })
    ).toBeUndefined();
  });

  it('returns undefined when the status has no PR url', () => {
    expect(
      resolvePullRequestClickTarget({
        ...singleRow,
        gitStatus: { label: '⎇ main', pullRequestLabel: '#3' },
        clickRow: composerTop,
        clickColumn: labelStart + 1
      })
    ).toBeUndefined();
  });

  it('returns undefined when the cwd line is hidden (command palette open, cwdRows 0)', () => {
    expect(
      resolvePullRequestClickTarget({ ...singleRow, cwdRows: 0, clickRow: composerTop, clickColumn: labelStart + 1 })
    ).toBeUndefined();
  });

  it('maps a click onto a wrapped row using the hard-wrap model', () => {
    // Force the label onto the second visual row by making each row narrower
    // than the label's offset, then derive the click from that wrap model.
    const columns = Math.max(1, labelStart - 1);
    const rowOffset = Math.floor(labelStart / columns);
    const columnInRow = labelStart % columns;
    const cwdRows = rowOffset + 1;
    const clickRow = composerTop - cwdRows + rowOffset + 1;

    expect(
      resolvePullRequestClickTarget({
        composerTop,
        cwdRows,
        columns,
        workspaceCwd,
        gitStatus,
        clickRow,
        clickColumn: columnInRow + 1
      })
    ).toBe(url);
  });

  it('does not map the reserved final-column gutter onto the next wrapped row', () => {
    const columns = Math.max(1, labelStart);
    const cwdRows = 2;
    const firstRow = composerTop - cwdRows + 1;

    expect(
      resolvePullRequestClickTarget({
        composerTop,
        cwdRows,
        columns,
        workspaceCwd,
        gitStatus,
        clickRow: firstRow,
        clickColumn: columns + 1
      })
    ).toBeUndefined();
  });
});
