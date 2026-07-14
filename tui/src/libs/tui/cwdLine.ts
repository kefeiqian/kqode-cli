import os from 'node:os';
import path from 'node:path';
import type { GitStatus } from '@contracts/backend/index.ts';

export function formatCwdLine(workspaceCwd: string, gitStatus?: GitStatus): string {
  const cwdSegment = formatDisplayCwd(workspaceCwd);
  const gitSegment = gitStatus === undefined ? '' : ` [${gitStatus.label}]`;
  const pullRequestSegment =
    gitStatus?.pullRequestLabel === undefined ? '' : ` [${gitStatus.pullRequestLabel}]`;
  return `${cwdSegment}${gitSegment}${pullRequestSegment}`;
}

export function countCwdRows(
  workspaceCwd: string,
  gitStatus: GitStatus | undefined,
  columns: number
): number {
  const visibleColumns = Math.max(1, columns);
  return Math.max(1, Math.ceil(formatCwdLine(workspaceCwd, gitStatus).length / visibleColumns));
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
