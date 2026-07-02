import {execFileSync} from 'node:child_process';

const GIT_BRANCH_ICON = '⎇';
const UNSTAGED_CHANGE_FLAG = '*';
const STAGED_CHANGE_FLAG = '+';
const UNTRACKED_CHANGE_FLAG = '%';
const STATUS_BRANCH_PREFIX = '## ';
const STATUS_UPSTREAM_SEPARATOR = '...';
const NO_COMMITS_BRANCH_PREFIX = 'No commits yet on ';
const DETACHED_HEAD_STATUS = 'HEAD (no branch)';
const GIT_STATUS_TIMEOUT_MS = 2_000;

export type GitStatus = {
  branch: string;
  hasUnstagedChanges: boolean;
  hasStagedChanges: boolean;
  hasUntrackedChanges: boolean;
};

export function readGitStatusLabel(cwd: string): string | undefined {
  try {
    const porcelainStatus = execFileSync(
      'git',
      ['-C', cwd, 'status', '--porcelain=v1', '--branch'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_STATUS_TIMEOUT_MS
      }
    );

    return formatGitStatusLabel(parseGitStatus(porcelainStatus));
  } catch {
    return undefined;
  }
}

export function formatGitStatusLabel(status: GitStatus | undefined): string | undefined {
  if (status === undefined) {
    return undefined;
  }

  return `${GIT_BRANCH_ICON} ${status.branch}${formatGitStatusFlags(status)}`;
}

export function parseGitStatus(porcelainStatus: string): GitStatus | undefined {
  const lines = porcelainStatus.split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith(STATUS_BRANCH_PREFIX));
  const branch = parseBranchName(branchLine);

  if (branch === undefined) {
    return undefined;
  }

  return lines.reduce<GitStatus>(
    (status, line) => {
      if (line.startsWith(STATUS_BRANCH_PREFIX)) {
        return status;
      }

      return {
        branch: status.branch,
        hasUnstagedChanges:
          status.hasUnstagedChanges || (line[1] !== ' ' && line[1] !== '?' && line[1] !== '!'),
        hasStagedChanges:
          status.hasStagedChanges || (line[0] !== ' ' && line[0] !== '?' && line[0] !== '!'),
        hasUntrackedChanges: status.hasUntrackedChanges || line.startsWith('??')
      };
    },
    {
      branch,
      hasUnstagedChanges: false,
      hasStagedChanges: false,
      hasUntrackedChanges: false
    }
  );
}

function parseBranchName(branchLine: string | undefined): string | undefined {
  if (branchLine === undefined) {
    return undefined;
  }

  const branchStatus = branchLine.slice(STATUS_BRANCH_PREFIX.length);

  if (branchStatus.startsWith(NO_COMMITS_BRANCH_PREFIX)) {
    return branchStatus.slice(NO_COMMITS_BRANCH_PREFIX.length);
  }

  if (branchStatus === DETACHED_HEAD_STATUS) {
    return 'HEAD';
  }

  return branchStatus.split(STATUS_UPSTREAM_SEPARATOR)[0].split(' [')[0];
}

function formatGitStatusFlags(status: GitStatus): string {
  return [
    status.hasUnstagedChanges ? UNSTAGED_CHANGE_FLAG : '',
    status.hasStagedChanges ? STAGED_CHANGE_FLAG : '',
    status.hasUntrackedChanges ? UNTRACKED_CHANGE_FLAG : ''
  ].join('');
}
