import type { GitStatus } from '@contracts/backend/index.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { pullRequestLabelOffset } from '@libs/tui/cwdLine.ts';

/** Inputs for locating a left click on the cwd line's pull-request label. */
export type PullRequestClickParams = {
  /** 1-based SGR pointer row of the click. */
  clickRow: number;
  /** 1-based SGR pointer column of the click. */
  clickColumn: number;
  /** 0-based row of the first composer text line; the cwd line sits directly above it. */
  composerTop: number;
  /** Rows the cwd line occupies; `0` while it is hidden (command palette open). */
  cwdRows: number;
  /** Guarded chrome width used for the cwd line's hard-wrap math. */
  columns: number;
  workspaceCwd: string;
  gitStatus?: GitStatus;
};

/**
 * The pull-request URL to open when a left click lands on the `#3` label in the
 * cwd line, or `undefined` when the click misses it or there is no PR link.
 *
 * The label span is located with the same hard-wrap model as `countCwdRows`
 * (every visible row is `columns` wide), so a click on any wrapped row maps back
 * to a flat character offset that is tested against the label's `[start, end)`.
 * The app owns the mouse (SGR tracking), so this fires on a plain single click
 * without the terminal-native modifier the OSC 8 link would otherwise require.
 */
export function resolvePullRequestClickTarget(
  params: PullRequestClickParams
): string | undefined {
  const { gitStatus, cwdRows, columns } = params;
  const url = gitStatus?.pullRequestUrl;
  const label = gitStatus?.pullRequestLabel;
  if (
    url === undefined ||
    label === undefined ||
    cwdRows <= 0 ||
    columns <= 0 ||
    params.clickColumn < 1 ||
    params.clickColumn > columns
  ) {
    return undefined;
  }

  const labelStart = pullRequestLabelOffset(params.workspaceCwd, gitStatus);
  if (labelStart === undefined) {
    return undefined;
  }

  const cwdTopRow = params.composerTop - cwdRows;
  const rowOffset = params.clickRow - 1 - cwdTopRow;
  if (rowOffset < 0 || rowOffset >= cwdRows) {
    return undefined;
  }

  const flatOffset = rowOffset * columns + (params.clickColumn - 1);
  return flatOffset >= labelStart && flatOffset < labelStart + displayWidth(label)
    ? url
    : undefined;
}
