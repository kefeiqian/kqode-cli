import type { createStore } from 'jotai';
import { BACKEND_LOADING_HINT } from '@constants/statusHint.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import {
  refreshGitStatusAtom,
  refreshPullRequestAtom
} from '@state/ui/gitStatus/index.ts';
import { startupStatusHintAtom } from '@state/ui/statusHint.ts';

type Store = ReturnType<typeof createStore>;

/** Backend seam plus the lifecycle hooks the composition root drives. */
export type RuntimeBackendClient = BackendClient & {
  ensureStarted(): Promise<void>;
  dispose(): void;
};

/**
 * Injects an already-created backend client into the store and starts it eagerly.
 *
 * The composition root owns the process: `client` is published through the narrow
 * `backendClientAtom` seam, the backend is started immediately behind the
 * `Loading backend` hint instead of lazily on the first prompt, and the returned
 * disposer tears the process down and clears the seam on exit. A failed start
 * keeps the Dead-state client in the seam so the next submit retries via
 * `ensureSession()` and, on repeat failure, surfaces a visible error entry
 * instead of silently dropping the prompt.
 */
export function startBackendRuntime(store: Store, client: RuntimeBackendClient): () => void {
  store.set(backendClientAtom, client);
  store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);

  void client
    .ensureStarted()
    .then(async () => {
      // Backend is ready: fetch the fast local label first, then the branch's
      // pull request once. The PR is a `gh` network call that is static for the
      // session, so it is fetched a single time at bootstrap rather than per turn.
      await store.set(refreshGitStatusAtom);
      await store.set(refreshPullRequestAtom);
    })
    .catch(() => {
      // Keep the Dead-state client in the seam (do not dispose or clear it): the
      // next submit retries through ensureSession() and, on repeat failure,
      // settles a visible backend-error entry rather than silently dropping it.
    })
    .finally(() => {
      store.set(startupStatusHintAtom, undefined);
    });

  return () => {
    client.dispose();
    store.set(backendClientAtom, undefined);
  };
}
