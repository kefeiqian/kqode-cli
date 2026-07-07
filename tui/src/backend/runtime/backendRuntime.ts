import type { createStore } from 'jotai';
import type { BackendClient } from '@contracts/backend/index.ts';
import type { SessionLogger } from '@backend/log/sessionLogger.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import { resetTranscriptMirrorAtom, transcriptEventAtom } from '@state/promptQueue/atoms.ts';
import { appendClientOnlyErrorAtom } from '@state/promptQueue/clientOnlyRows.ts';
import { refreshGitStatusAtom } from '@state/ui/gitStatus.ts';
import { BACKEND_LOADING_HINT, startupStatusHintAtom } from '@state/ui/statusHint.ts';

type Store = ReturnType<typeof createStore>;

/** Backend seam plus the lifecycle hooks the composition root drives. */
export type RuntimeBackendClient = BackendClient & {
  onReady(listener: (sessionId: string) => void): void;
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
export function startBackendRuntime(
  store: Store,
  client: RuntimeBackendClient,
  logger: SessionLogger
): () => void {
  let disposed = false;
  store.set(backendClientAtom, client);
  store.set(startupStatusHintAtom, BACKEND_LOADING_HINT);
  const unsubscribeTranscript = client.onTranscriptEvent((event) => {
    store.set(transcriptEventAtom, event);
  });

  // On readiness the backend announces its session id; adopt it so the TUI log
  // lands in the same per-session directory. Fires again on respawn.
  client.onReady((sessionId) => {
    store.set(resetTranscriptMirrorAtom);
    logger.openSession(sessionId);
    logger.log({ event: 'backendReady', sessionId });
  });

  void client
    .ensureStarted()
    .then(() => {
      // Backend is ready: fetch the initial git label off the render path.
      void store.set(refreshGitStatusAtom);
    })
    .catch((error: unknown) => {
      if (disposed) {
        return;
      }
      // Startup failed without readiness: flush buffered startup events to an
      // orphan session so the spawn/build failure is still captured. The
      // Dead-state client stays in the seam so the next submit retries via
      // ensureSession() and settles a visible error rather than dropping it.
      logger.openOrphan();
      const message = startupFailureMessage(error);
      logger.log({ event: 'backendStartFailed', message });
      store.set(appendClientOnlyErrorAtom, message);
    })
    .finally(() => {
      if (disposed) {
        return;
      }
      store.set(startupStatusHintAtom, undefined);
    });

  return () => {
    disposed = true;
    logger.log({ event: 'sessionExit' });
    unsubscribeTranscript();
    client.dispose();
    logger.close();
    store.set(backendClientAtom, undefined);
    store.set(startupStatusHintAtom, undefined);
  };
}

function startupFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
