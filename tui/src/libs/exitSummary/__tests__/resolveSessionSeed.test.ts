import { describe, expect, it } from 'vitest';
import { resolveSessionSeed } from '@libs/exitSummary/resolveSessionSeed.ts';

describe('resolveSessionSeed', () => {
  it('captures the start time and git baseline from the injected seams', () => {
    const seed = resolveSessionSeed({
      cwd: '/repo',
      now: () => 1_234,
      readLineDelta: (cwd) => (cwd === '/repo' ? { insertions: 3, deletions: 1 } : undefined)
    });

    expect(seed).toEqual({ startedAt: 1_234, baseline: { insertions: 3, deletions: 1 } });
  });

  it('still records the start time when there is no git baseline (non-repo)', () => {
    const seed = resolveSessionSeed({ cwd: '/tmp', now: () => 42, readLineDelta: () => undefined });

    expect(seed).toEqual({ startedAt: 42, baseline: undefined });
  });
});
