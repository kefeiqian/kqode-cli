import type { createStore } from 'jotai';
import { readWorkingTreeLineDelta, type GitLineDelta } from '@libs/git/lineDelta.ts';
import type { ExitSummaryData } from '@components/exitSummary/types.ts';
import { sessionGitBaselineAtom, sessionStartedAtAtom, workspaceCwdAtom } from '@state/global/index.ts';

type Store = ReturnType<typeof createStore>;

export type ComputeExitSummaryDeps = {
  store: Store;
  now?: () => number;
  readLineDelta?: (cwd: string) => GitLineDelta | undefined;
};

/**
 * Builds {@link ExitSummaryData} from the session store.
 *
 * `durationMs` is the elapsed time since the seeded start; an unseeded start
 * (`0`) yields `undefined` so the Duration row is omitted rather than showing a
 * decades-long value. `changes` is the exit-time working-tree delta minus the
 * startup baseline (clamped at zero so pre-existing churn and mid-session
 * commits never go negative); a missing baseline or read yields `undefined`.
 * `readLineDelta` and `now` are injected for tests.
 */
export function computeExitSummary({
  store,
  now = Date.now,
  readLineDelta = readWorkingTreeLineDelta
}: ComputeExitSummaryDeps): ExitSummaryData {
  const startedAt = store.get(sessionStartedAtAtom);
  const baseline = store.get(sessionGitBaselineAtom);
  const cwd = store.get(workspaceCwdAtom);

  return {
    durationMs: startedAt > 0 ? now() - startedAt : undefined,
    changes: resolveChanges(baseline, readLineDelta(cwd))
  };
}

function resolveChanges(
  baseline: GitLineDelta | undefined,
  current: GitLineDelta | undefined
): GitLineDelta | undefined {
  if (baseline === undefined || current === undefined) {
    return undefined;
  }

  return {
    insertions: Math.max(0, current.insertions - baseline.insertions),
    deletions: Math.max(0, current.deletions - baseline.deletions)
  };
}
