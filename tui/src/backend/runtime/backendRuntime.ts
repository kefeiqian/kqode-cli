import type { createStore } from 'jotai';
import type { BackendClient } from '@contracts/backend/index.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import { refreshGitStatusAtom } from '@state/ui/gitStatus.ts';
import { BACKEND_LOADING_HINT, startupStatusHintAtom } from '@state/ui/statusHint.ts';

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
    .then(() => {
      // Backend is ready: fetch the initial git label off the render path.
      void store.set(refreshGitStatusAtom);
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
