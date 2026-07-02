import { readWorkingTreeLineDelta, type GitLineDelta } from '@libs/git/lineDelta.ts';

/** Boot-time session snapshot the composition root writes into the session atoms. */
export type SessionSeed = {
  startedAt: number;
  baseline: GitLineDelta | undefined;
};

export type ResolveSessionSeedDeps = {
  cwd: string;
  now?: () => number;
  readLineDelta?: (cwd: string) => GitLineDelta | undefined;
};

/**
 * Captures the session start time and the startup git baseline for the exit
 * summary's Duration and Changes rows.
 *
 * Pure by design: it returns the values rather than importing the session atoms,
 * so the composition root does the `store.set` and the state layer keeps no
 * dependency on this git-touching module. `now` and `readLineDelta` are injected
 * for tests.
 */
export function resolveSessionSeed({
  cwd,
  now = Date.now,
  readLineDelta = readWorkingTreeLineDelta
}: ResolveSessionSeedDeps): SessionSeed {
  return {
    startedAt: now(),
    baseline: readLineDelta(cwd)
  };
}
