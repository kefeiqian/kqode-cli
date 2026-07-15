import { atom } from 'jotai';
import type { GitStatus } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';

/** The latest workspace git/PR status, or `undefined` before the first fetch. */
export const gitStatusAtom = atom<GitStatus | undefined>(undefined);

/**
 * Refreshes the working-tree label in {@link gitStatusAtom} from
 * `kqode.git.status`, preserving any pull-request segment already fetched by
 * {@link refreshPullRequestAtom}.
 *
 * Best-effort: with no backend client wired, or when the request fails, the last
 * known status is kept rather than blanked. The TUI triggers this on startup and
 * after each turn (the agent may have changed the working tree). A `null` result
 * (not a git repository) clears the whole segment.
 */
export const refreshGitStatusAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) {
    return;
  }

  try {
    const status = await client.gitStatus();
    if (status === null) {
      set(gitStatusAtom, undefined);
      return;
    }
    set(gitStatusAtom, { ...get(gitStatusAtom), label: status.label });
  } catch {
    // Keep the last known status; a transient failure should not blank the row.
  }
});

/**
 * Fetches the branch's pull request once and merges its label + URL into
 * {@link gitStatusAtom}, leaving the working-tree label untouched.
 *
 * A branch's PR is static for the session and the lookup is a `gh` network call,
 * so the TUI runs this a single time at bootstrap rather than on every turn.
 * Best-effort: it is a no-op without a client, keeps the last known PR on
 * failure, and does nothing until a label exists to attach to (the bootstrap
 * sequence refreshes the label first).
 */
export const refreshPullRequestAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) {
    return;
  }

  try {
    const pullRequest = await client.pullRequest();
    const current = get(gitStatusAtom);
    if (current === undefined) {
      return;
    }
    set(gitStatusAtom, {
      ...current,
      pullRequestLabel: pullRequest?.label,
      pullRequestUrl: pullRequest?.url
    });
  } catch {
    // Keep the last known pull request; a transient failure should not blank it.
  }
});
