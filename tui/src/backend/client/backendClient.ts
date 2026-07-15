import { type MessageConnection } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_STARTUP_TIMEOUT_MS } from '@constants/backend.ts';
import type { LaunchedBackend } from '@backend/process/backendProcess.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import { BackendLifecycleState } from '@backend/client/backendLifecycle.ts';
import type { BackendLifecycleState as BackendLifecycleStateValue } from '@backend/client/backendLifecycle.ts';
import { openReadyConnection } from '@backend/client/backendReadiness.ts';
import {
  isFatalBackendError,
  toLaunchError
} from '@backend/client/backendClientErrors.ts';
import type { SubmitOutcome, SubmitParams } from '@contracts/backend/index.ts';

export { BackendLifecycleState };

/** Lifecycle handle over a {@link BackendClient} that owns one child backend at a time. */
export type BackendClientHandle = BackendClient & {
  getState(): BackendLifecycleStateValue;
  ensureStarted(): Promise<void>;
  dispose(): void;
};

/** Composition inputs for the generic backend client: an injected process launcher. */
export type BackendClientOptions = {
  /** Produces a freshly launched backend process; source/packaged factories inject this. */
  launch: () => Promise<LaunchedBackend>;
  requestTimeoutMs?: number;
  /** Ceiling for the launched backend to signal JSON-RPC readiness before it is torn down. */
  startupTimeoutMs?: number;
};

type BackendSession = {
  backend: LaunchedBackend;
  connection: MessageConnection;
  client: BackendClient;
};

/**
 * Creates a JSON-RPC client over a launched child backend.
 *
 * One backend serves the whole TUI session. Recoverable method errors keep the
 * process alive; fatal transport/timeout/exit failures dispose the connection
 * and mark the client `dead`. The next submit after `dead` respawns a fresh
 * backend (persisted session restore is added with the session methods), never
 * silently and never auto-replaying interrupted work.
 *
 * `dispose()` is terminal: once disposed, `ensureStarted`/`submit` reject
 * with a `launch`-kind {@link BackendClientError} without spawning a replacement,
 * so a torn-down client can never orphan a new backend process.
 */
export function createBackendClient(options: BackendClientOptions): BackendClientHandle {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const { launch } = options;

  let state: BackendLifecycleStateValue = BackendLifecycleState.Idle;
  let session: BackendSession | null = null;
  let starting: Promise<BackendSession> | null = null;
  let disposed = false;

  const disposedError = (): BackendClientError =>
    new BackendClientError(BackendErrorKind.Launch, 'backend client disposed');

  const abortedError = (): BackendClientError =>
    new BackendClientError(
      BackendErrorKind.Launch,
      'backend launch was aborted before it became ready'
    );

  const teardown = (nextState: BackendLifecycleStateValue): void => {
    const current = session;
    session = null;
    state = nextState;
    if (current !== null) {
      current.connection.dispose();
      current.backend.dispose();
    }
  };

  const markDead = (): void => {
    if (state === BackendLifecycleState.Closing || state === BackendLifecycleState.Dead) {
      return;
    }
    teardown(BackendLifecycleState.Dead);
  };

  const start = async (): Promise<BackendSession> => {
    state = BackendLifecycleState.Starting;
    let backend: LaunchedBackend;
    try {
      backend = await launch();
    } catch (error) {
      state = BackendLifecycleState.Dead;
      throw toLaunchError(error);
    }

    // The client may have been disposed (or marked dead) while the launch was in
    // flight. Only `dispose()` can change state during this window because no
    // connection/exit listeners are wired yet; reclaim the process instead of
    // resurrecting a backend nobody will dispose.
    if (state !== BackendLifecycleState.Starting) {
      backend.dispose();
      throw abortedError();
    }

    // Gate "ready" on the backend actually speaking JSON-RPC (readiness
    // notification) rather than trusting the OS spawn event.
    let connection: MessageConnection;
    try {
      connection = await openReadyConnection({ backend, startupTimeoutMs, onFatal: markDead });
    } catch (error) {
      if (state === BackendLifecycleState.Starting) {
        state = BackendLifecycleState.Dead;
      }
      throw error;
    }

    // Disposal can land while we await readiness; reclaim the freshly launched
    // backend instead of publishing a session over a client that is tearing down.
    if (state !== BackendLifecycleState.Starting) {
      connection.dispose();
      backend.dispose();
      throw abortedError();
    }

    const opened: BackendSession = {
      backend,
      connection,
      client: createMessageConnectionClient(connection, { requestTimeoutMs })
    };
    session = opened;
    state = BackendLifecycleState.Ready;
    return opened;
  };

  const ensureSession = (): Promise<BackendSession> => {
    if (disposed) {
      return Promise.reject(disposedError());
    }
    if (session !== null && state === BackendLifecycleState.Ready) {
      return Promise.resolve(session);
    }
    if (starting === null) {
      starting = start().finally(() => {
        starting = null;
      });
    }
    return starting;
  };

  return {
    getState: () => state,
    async ensureStarted(): Promise<void> {
      await ensureSession();
    },
    async submit(params: SubmitParams): Promise<SubmitOutcome> {
      if (disposed) {
        throw disposedError();
      }
      const active = await ensureSession();
      try {
        return await active.client.submit(params);
      } catch (error) {
        if (isFatalBackendError(error)) {
          markDead();
        }
        throw error;
      }
    },
    async gitStatus() {
      if (disposed) {
        throw disposedError();
      }
      const active = await ensureSession();
      return active.client.gitStatus();
    },
    dispose() {
      disposed = true;
      if (state === BackendLifecycleState.Dead) {
        return;
      }
      state = BackendLifecycleState.Closing;
      teardown(BackendLifecycleState.Dead);
    }
  };
}
