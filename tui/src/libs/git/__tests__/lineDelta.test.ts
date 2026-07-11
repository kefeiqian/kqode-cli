import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseShortstat, readWorkingTreeLineDelta } from '@libs/git/lineDelta.ts';

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock
}));

describe('parseShortstat', () => {
  it('parses insertions and deletions from a full shortstat line', () => {
    expect(parseShortstat('3 files changed, 12 insertions(+), 4 deletions(-)')).toEqual({
      insertions: 12,
      deletions: 4
    });
  });

  it('defaults the missing side to zero for insertions-only and deletions-only output', () => {
    expect(parseShortstat('1 file changed, 5 insertions(+)')).toEqual({
      insertions: 5,
      deletions: 0
    });
    expect(parseShortstat('1 file changed, 7 deletions(-)')).toEqual({
      insertions: 0,
      deletions: 7
    });
  });

  it("parses git's singular insertion/deletion form so single-line edits are not dropped", () => {
    expect(parseShortstat('1 file changed, 1 insertion(+), 1 deletion(-)')).toEqual({
      insertions: 1,
      deletions: 1
    });
  });

  it('treats an empty string (clean tree) as zero churn', () => {
    expect(parseShortstat('')).toEqual({ insertions: 0, deletions: 0 });
    expect(parseShortstat('   \n')).toEqual({ insertions: 0, deletions: 0 });
  });

  it('treats a shortstat line without +/- counts (mode-only change) as zero churn', () => {
    expect(parseShortstat('1 file changed')).toEqual({ insertions: 0, deletions: 0 });
  });

  it('returns undefined for output that is not shortstat', () => {
    expect(parseShortstat('fatal: not a git repository')).toBeUndefined();
  });
});

describe('readWorkingTreeLineDelta', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it('spawns git hidden so the tool can never disturb the terminal title', () => {
    execFileSyncMock.mockReturnValue('1 file changed, 2 insertions(+)');

    readWorkingTreeLineDelta('/repo');

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(execFileSyncMock.mock.calls[0][2]).toMatchObject({ windowsHide: true });
  });
});
