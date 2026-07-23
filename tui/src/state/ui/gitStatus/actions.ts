import { atom } from 'jotai';
import { backendClientAtom } from '@state/global/backend.ts';
import { gitStatusAtom } from '@state/ui/gitStatus/state.ts';

/** Refreshes the local working-tree label while preserving the PR segment. */
export const refreshGitStatusAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) return;

  try {
    const status = await client.gitStatus();
    if (status === null) {
      set(gitStatusAtom, undefined);
      return;
    }
    set(gitStatusAtom, { ...get(gitStatusAtom), label: status.label });
  } catch {
    // Preserve the last known status after transient failures.
  }
});

/** Fetches the branch pull request once and merges it into the current label. */
export const refreshPullRequestAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) return;

  try {
    const pullRequest = await client.pullRequest();
    const current = get(gitStatusAtom);
    if (current === undefined) return;
    set(gitStatusAtom, {
      ...current,
      pullRequestLabel: pullRequest?.label,
      pullRequestUrl: pullRequest?.url
    });
  } catch {
    // Preserve the last known pull request after transient failures.
  }
});
