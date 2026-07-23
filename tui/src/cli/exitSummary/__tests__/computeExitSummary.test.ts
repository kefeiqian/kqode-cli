import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { computeExitSummary } from '@/cli/exitSummary/computeExitSummary.ts';
import type { GitLineDelta } from '@libs/git/lineDelta.ts';
import {
  sessionGitBaselineAtom,
  sessionStartedAtAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';

type StoreSeed = {
  startedAt?: number;
  baseline?: GitLineDelta;
  cwd?: string;
};

function seededStore({ startedAt = 0, baseline, cwd = '/repo' }: StoreSeed) {
  const store = createStore();
  store.set(sessionStartedAtAtom, startedAt);
  store.set(sessionGitBaselineAtom, baseline);
  store.set(workspaceCwdAtom, cwd);
  return store;
}

describe('computeExitSummary', () => {
  it('subtracts the baseline from the exit-time delta and measures duration', () => {
    const store = seededStore({ startedAt: 1_000, baseline: { insertions: 2, deletions: 1 } });

    const data = computeExitSummary({
      store,
      now: () => 126_000,
      readLineDelta: () => ({ insertions: 12, deletions: 4 })
    });

    expect(data).toEqual({ durationMs: 125_000, changes: { insertions: 10, deletions: 3 } });
  });

  it('renders Changes as undefined when there is no baseline', () => {
    const store = seededStore({ startedAt: 1_000, baseline: undefined });

    const data = computeExitSummary({
      store,
      now: () => 2_000,
      readLineDelta: () => ({ insertions: 5, deletions: 0 })
    });

    expect(data.changes).toBeUndefined();
  });

  it('renders Changes as undefined when the exit-time read fails (e.g. non-repo)', () => {
    const store = seededStore({ startedAt: 1_000, baseline: { insertions: 0, deletions: 0 } });

    const data = computeExitSummary({ store, now: () => 2_000, readLineDelta: () => undefined });

    expect(data.changes).toBeUndefined();
  });

  it('clamps a below-baseline delta (mid-session commit) to zero', () => {
    const store = seededStore({ startedAt: 1_000, baseline: { insertions: 10, deletions: 8 } });

    const data = computeExitSummary({
      store,
      now: () => 2_000,
      readLineDelta: () => ({ insertions: 3, deletions: 1 })
    });

    expect(data.changes).toEqual({ insertions: 0, deletions: 0 });
  });

  it('renders Duration as undefined when the session start was never seeded', () => {
    const store = seededStore({ startedAt: 0, baseline: { insertions: 0, deletions: 0 } });

    const data = computeExitSummary({
      store,
      now: () => 9_999_999,
      readLineDelta: () => ({ insertions: 0, deletions: 0 })
    });

    expect(data.durationMs).toBeUndefined();
  });
});
