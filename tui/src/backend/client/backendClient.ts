import { type MessageConnection } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_STARTUP_TIMEOUT_MS } from '@constants/backend.ts';
import type { LaunchedBackend } from '@backend/process/backendProcess.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import { openReadyConnection } from '@backend/client/backendReadiness.ts';
import {
  isFatalBackendError,
  toLaunchError
} from '@backend/client/backendClientErrors.ts';
import {
  BackendLifecycleState,
  type BackendClientHandle,
  type BackendClientOptions
} from '@backend/client/backendClientTypes.ts';
import type {
  ActiveSelectionResult,
  ProviderStatusInfo,
  StreamCallbacks,
  StreamOutcome,
  StreamSubmitParams
} from '@contracts/backend/index.ts';

export { BackendLifecycleState };
export type { BackendClientHandle, BackendClientOptions };

type BackendSession = {
  backend: LaunchedBackend;
  connection: MessageConnection;
  client: BackendClient;
};

/** Creates a lifecycle-managed JSON-RPC client over a launched child backend. */
export function createBackendClient(options: BackendClientOptions): BackendClientHandle {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const { launch } = options;

  let state: BackendLifecycleState = BackendLifecycleState.Idle;
  let session: BackendSession | null = null;
  let starting: Promise<BackendSession> | null = null;
  let disposed = false;
  const readyListeners: Array<(sessionId: string) => void> = [];

  const disposedError = (): BackendClientError =>
    new BackendClientError(BackendErrorKind.Launch, 'backend client disposed');

  const abortedError = (): BackendClientError =>
    new BackendClientError(
      BackendErrorKind.Launch,
      'backend launch was aborted before it became ready'
    );

  const teardown = (nextState: BackendLifecycleState): void => {
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
    let sessionId: string;
    try {
      ({ connection, sessionId } = await openReadyConnection({
        backend,
        startupTimeoutMs,
        onFatal: markDead
      }));
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
    for (const listener of readyListeners) {
      listener(sessionId);
    }
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

  const withClient = async <T>(operation: (client: BackendClient) => Promise<T>): Promise<T> => {
    if (disposed) {
      throw disposedError();
    }
    const active = await ensureSession();
    try {
      return await operation(active.client);
    } catch (error) {
      if (isFatalBackendError(error)) {
        markDead();
      }
      throw error;
    }
  };

  return {
    getState: () => state,
    onReady(listener: (sessionId: string) => void): void {
      readyListeners.push(listener);
    },
    async ensureStarted(): Promise<void> {
      await ensureSession();
    },
    async submitStreaming(
      params: StreamSubmitParams,
      callbacks: StreamCallbacks
    ): Promise<StreamOutcome> {
      return withClient((client) => client.submitStreaming(params, callbacks));
    },
    async gitStatus(): Promise<string | null> {
      return withClient((client) => client.gitStatus());
    },
    async listProviders(): Promise<ProviderStatusInfo[]> {
      return withClient((client) => client.listProviders());
    },
    async getActiveSelection(): Promise<ActiveSelectionResult> {
      return withClient((client) => client.getActiveSelection());
    },
    async setActiveSelection(providerId: string, modelId: string): Promise<void> {
      await withClient((client) => client.setActiveSelection(providerId, modelId));
    },
    async clearProviderKey(providerId: string): Promise<void> {
      await withClient((client) => client.clearProviderKey(providerId));
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
