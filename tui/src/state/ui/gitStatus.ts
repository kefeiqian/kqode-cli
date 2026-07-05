import { atom } from 'jotai';
import { backendClientAtom } from '@state/global/backend.ts';

/** The latest workspace git status label, or `undefined` before the first fetch. */
export const gitStatusLabelAtom = atom<string | undefined>(undefined);

/**
 * Refreshes {@link gitStatusLabelAtom} from the backend's `kqode.git.status`.
 *
 * Best-effort: with no backend client wired, or when the request fails, the last
 * known label is kept rather than blanked. The TUI triggers this on startup and
 * after each turn (the agent may have changed the working tree). The backend
 * runs `git` and formats the label; this only stores the returned string.
 */
export const refreshGitStatusAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) {
    return;
  }

  try {
    const label = await client.gitStatus();
    set(gitStatusLabelAtom, label ?? undefined);
  } catch {
    // Keep the last known label; a transient failure should not blank the cwd row.
  }
});
