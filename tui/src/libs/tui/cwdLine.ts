import os from 'node:os';
import path from 'node:path';

export function formatCwdLine(workspaceCwd: string, gitStatusLabel?: string): string {
  const cwdSegment = formatDisplayCwd(workspaceCwd);
  const gitSegment = gitStatusLabel === undefined ? '' : ` [${gitStatusLabel}]`;
  return `${cwdSegment}${gitSegment}`;
}

export function countCwdRows(workspaceCwd: string, gitStatusLabel: string | undefined, columns: number): number {
  const visibleColumns = Math.max(1, columns);
  return Math.max(1, Math.ceil(formatCwdLine(workspaceCwd, gitStatusLabel).length / visibleColumns));
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
