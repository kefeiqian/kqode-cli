import os from 'node:os';
import path from 'node:path';
import type { GitStatus } from '@contracts/backend/index.ts';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { sanitizeDisplayText } from '@libs/text/sanitizeDisplayText.ts';
import { dottedUnderline, hyperlink } from '@libs/terminal/hyperlink.ts';

/** The cwd + git-label prefix shared by the plain and decorated renderings. */
function cwdAndGitPrefix(workspaceCwd: string, gitStatus?: GitStatus): string {
  const cwdSegment = sanitizeSingleLine(formatDisplayCwd(workspaceCwd));
  const gitSegment =
    gitStatus === undefined ? '' : ` [${sanitizeSingleLine(gitStatus.label)}]`;
  return `${cwdSegment}${gitSegment}`;
}

/**
 * The cwd row as plain text (no escape sequences), e.g. `~/proj [⎇ main*] [#3]`.
 *
 * Width and wrap math ({@link countCwdRows}) measure this string;
 * {@link renderCwdLine} produces the display string, which has the same visible
 * characters plus zero-width decoration, so both agree on the row's width.
 */
export function formatCwdLine(workspaceCwd: string, gitStatus?: GitStatus): string {
  const pullRequestSegment =
    gitStatus?.pullRequestLabel === undefined
      ? ''
      : ` [${sanitizeSingleLine(gitStatus.pullRequestLabel)}]`;
  return `${cwdAndGitPrefix(workspaceCwd, gitStatus)}${pullRequestSegment}`;
}

/**
 * The cwd row for display: identical visible text to {@link formatCwdLine}, but
 * when the status carries a pull-request URL the PR label (e.g. `#3`) is wrapped
 * in a dotted underline and an OSC 8 hyperlink so supporting terminals render it
 * as a clickable link. Only zero-width escapes are added, so {@link formatCwdLine}
 * stays the source of truth for width.
 */
export function renderCwdLine(workspaceCwd: string, gitStatus?: GitStatus): string {
  return `${cwdAndGitPrefix(workspaceCwd, gitStatus)}${renderPullRequestSegment(gitStatus)}`;
}

/**
 * The ` [#3]` pull-request segment for display. The label is decorated (dotted
 * underline + OSC 8 link) only when a URL is present, so a bare label never
 * implies a link that cannot be opened.
 */
function renderPullRequestSegment(gitStatus?: GitStatus): string {
  const label = gitStatus?.pullRequestLabel;
  if (label === undefined) {
    return '';
  }
  const sanitizedLabel = sanitizeSingleLine(label);
  const url = gitStatus?.pullRequestUrl;
  const rendered =
    url === undefined ? sanitizedLabel : hyperlink(dottedUnderline(sanitizedLabel), url);
  return ` [${rendered}]`;
}

/**
 * The visible column offset at which the pull-request label (e.g. `#3`) starts
 * within {@link formatCwdLine}, or `undefined` when no PR label is shown.
 *
 * The click router uses it to map a pointer position back to the label's span.
 * The PR segment is ` [<label>]`, so the label begins after the leading ` [`.
 */
export function pullRequestLabelOffset(
  workspaceCwd: string,
  gitStatus?: GitStatus
): number | undefined {
  if (gitStatus?.pullRequestLabel === undefined) {
    return undefined;
  }
  return displayWidth(`${cwdAndGitPrefix(workspaceCwd, gitStatus)} [`);
}

export function countCwdRows(
  workspaceCwd: string,
  gitStatus: GitStatus | undefined,
  columns: number
): number {
  const visibleColumns = Math.max(1, columns);
  return Math.max(
    1,
    Math.ceil(displayWidth(formatCwdLine(workspaceCwd, gitStatus)) / visibleColumns)
  );
}

export function formatDisplayCwd(workspaceCwd: string, homeDir = os.homedir()): string {
  const normalizedCwd = path.normalize(workspaceCwd);
  const normalizedHome = path.normalize(homeDir);
  const compareCwd = normalizePathForComparison(normalizedCwd);
  const compareHome = normalizePathForComparison(normalizedHome);

  if (compareCwd === compareHome) {
    return '~';
  }

  const homePrefix = compareHome.endsWith(path.sep) ? compareHome : `${compareHome}${path.sep}`;
  if (!compareCwd.startsWith(homePrefix)) {
    return normalizedCwd;
  }

  return `~${path.sep}${normalizedCwd.slice(homePrefix.length)}`;
}

function normalizePathForComparison(pathName: string): string {
  return process.platform === 'win32' ? pathName.toLowerCase() : pathName;
}

function sanitizeSingleLine(text: string): string {
  return sanitizeDisplayText(text).replace(/\t/g, '\\x09').replace(/\n/g, '\\x0a');
}
