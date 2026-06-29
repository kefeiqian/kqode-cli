import os from 'node:os';
import path from 'node:path';
import { Box, Text } from 'ink';
import { clipTextLeft } from '@libs/text/clipText.js';
import { githubDarkTheme } from '@theme/themeConfig.js';

type CwdLineProps = {
  workspaceCwd: string;
  gitStatusLabel?: string;
  columns: number;
};

const MIN_VISIBLE_COLUMNS = 8;

export function CwdLine({ workspaceCwd, gitStatusLabel, columns }: CwdLineProps) {
  const cwdSegment = formatDisplayCwd(workspaceCwd);
  const gitSegment = gitStatusLabel === undefined ? '' : ` [${gitStatusLabel}]`;
  const visibleLine = clipTextLeft(
    `${cwdSegment}${gitSegment}`,
    Math.max(MIN_VISIBLE_COLUMNS, columns)
  );

  return (
    <Box>
      <Text color={githubDarkTheme.colors.foreground}>{visibleLine}</Text>
    </Box>
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
