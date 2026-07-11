import type { createStore } from 'jotai';
import type { BackendClient } from '@contracts/backend/index.ts';
import type { SessionLogger } from '@backend/log/sessionLogger.ts';
import { backendClientAtom } from '@state/global/backend.ts';
import { currentSessionIdAtom } from '@state/global/session.ts';
import { selectCurrentSessionId } from '@libs/resume/currentSessionId.ts';
import { resetTranscriptMirrorAtom, transcriptEventAtom } from '@state/promptQueue/atoms.ts';
import { appendClientOnlyErrorAtom } from '@state/promptQueue/clientOnlyRows.ts';
import { gitStatusLabelAtom } from '@state/ui/gitStatus.ts';
import { BACKEND_LOADING_HINT, compactionInProgressAtom, startupStatusHintAtom } from '@state/ui/statusHint.ts';

type Store = ReturnType<typeof createStore>;

/** Backend seam plus the lifecycle hooks the composition root drives. */
export type RuntimeBackendClient = BackendClient & {
  onReady(listener: (sessionId: string) => void): void;
  ensureStarted(): Promise<void>;
  relaunch(workspaceCwd: string): Promise<void>;
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
    if (event.type === 'compactionStatus') {
      store.set(compactionInProgressAtom, event.active);
      return;
    }
    if (event.type === 'settled') {
      // Safety net: a cancel mid-compaction never emits CompactionFinished, so
      // clear the "Auto compacting…" status on any terminal settle.
      store.set(compactionInProgressAtom, false);
    }
    // The session becomes resumable at its first accepted enqueue; capture its
    // durable id from session.list so the exit summary can print the resume
    // command. Guarded on `undefined` so it fetches only until the id is known.
    if (event.type === 'enqueued' && store.get(currentSessionIdAtom) === undefined) {
      void captureCurrentSessionId(store, client, () => disposed);
    }
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
      if (disposed) {
        return;
      }
      // Backend is ready: fetch the initial git label off the render path.
      void refreshGitStatusUnlessDisposed(store, client, () => disposed);
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

async function captureCurrentSessionId(
  store: Store,
  client: RuntimeBackendClient,
  isDisposed: () => boolean
): Promise<void> {
  try {
    const { sessions } = await client.listSessions();
    const sessionId = selectCurrentSessionId(sessions);
    if (sessionId !== undefined && !isDisposed()) {
      store.set(currentSessionIdAtom, sessionId);
    }
  } catch {
    // Best-effort capture: a missing id just omits the exit-card Resume row.
  }
}

async function refreshGitStatusUnlessDisposed(
  store: Store,
  client: RuntimeBackendClient,
  isDisposed: () => boolean
): Promise<void> {
  try {
    const label = await client.gitStatus();
    if (!isDisposed()) {
      store.set(gitStatusLabelAtom, label ?? undefined);
    }
  } catch {
    // Keep the last known label; a transient failure should not blank the cwd row.
  }
}
