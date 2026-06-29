import { describe, expect, it } from 'vitest';
import { formatGitStatusLabel, parseGitStatus } from '@libs/git/gitStatus.js';

describe('git status labels', () => {
  it('formats branch labels with staged, unstaged, and untracked flags', () => {
    const status = parseGitStatus(
      [
        '## feat/first-ink-tui-jsonrpc-backend...origin/feat/first-ink-tui-jsonrpc-backend',
        ' M tui/src/App.tsx',
        'A  tui/src/libs/git/gitStatus.ts',
        '?? tui/src/libs/git/__tests__/gitStatus.test.ts'
      ].join('\n')
    );

    expect(formatGitStatusLabel(status)).toBe('⎇ feat/first-ink-tui-jsonrpc-backend*+%');
  });

  it('returns a clean branch label when the worktree has no changes', () => {
    const status = parseGitStatus('## main...origin/main\n');

    expect(formatGitStatusLabel(status)).toBe('⎇ main');
  });
});
