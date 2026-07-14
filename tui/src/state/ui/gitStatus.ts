import { atom } from 'jotai';
import type { GitStatus } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';

/** The latest workspace git/PR status, or `undefined` before the first fetch. */
export const gitStatusAtom = atom<GitStatus | undefined>(undefined);

/**
 * Refreshes {@link gitStatusAtom} from the backend's `kqode.git.status`.
 *
 * Best-effort: with no backend client wired, or when the request fails, the last
 * known label is kept rather than blanked. The TUI triggers this on startup and
 * after each turn (the agent may have changed the working tree). The backend
 * runs git/GitHub status commands and formats display segments; this only
 * stores the returned status.
 */
export const refreshGitStatusAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) {
    return;
  }

  try {
    const status = await client.gitStatus();
    set(gitStatusAtom, status ?? undefined);
  } catch {
    // Keep the last known label; a transient failure should not blank the cwd row.
  }
});
