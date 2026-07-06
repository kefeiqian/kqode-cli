import { type MessageConnection } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_STARTUP_TIMEOUT_MS } from '@constants/backend.ts';
import type { LaunchedBackend } from '@backend/process/backendProcess.ts';
import { createMessageConnectionClient } from '@backend/client/messageConnectionClient.ts';
import type { MessageConnectionBackendClient } from '@backend/client/messageConnectionClient.ts';
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
  ModelListResult,
  ProviderListResult,
  SetKeyParams,
  SetKeyResult,
  StreamSubmitParams,
  TranscriptEvent
} from '@contracts/backend/index.ts';
export { BackendLifecycleState };
export type { BackendClientHandle, BackendClientOptions };
type BackendSession = {
  backend: LaunchedBackend;
  connection: MessageConnection;
  client: MessageConnectionBackendClient;
};
/** Creates a lifecycle-managed JSON-RPC client over a launched child backend. */
export function createBackendClient(options: BackendClientOptions): BackendClientHandle {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const validationRequestTimeoutMs = options.validationRequestTimeoutMs;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const { launch } = options;
  let state: BackendLifecycleState = BackendLifecycleState.Idle;
  let session: BackendSession | null = null;
  let starting: Promise<BackendSession> | null = null;
  let disposed = false;
  const readyListeners: Array<(sessionId: string) => void> = [];
  const transcriptListeners = new Set<(event: TranscriptEvent) => void>();
  let detachTranscriptEvents: (() => void) | undefined;
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
      current.client.failInFlight('backend connection closed before the turn completed');
      current.connection.dispose();
      detachTranscriptEvents?.();
      detachTranscriptEvents = undefined;
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
    if (state !== BackendLifecycleState.Starting) {
      backend.dispose();
      throw abortedError();
    }
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
    if (state !== BackendLifecycleState.Starting) {
      connection.dispose();
      backend.dispose();
      throw abortedError();
    }
    const innerClient = createMessageConnectionClient(connection, {
      requestTimeoutMs,
      validationRequestTimeoutMs
    });
    detachTranscriptEvents = innerClient.onTranscriptEvent((event) => {
      for (const listener of transcriptListeners) {
        listener(event);
      }
    });
    const opened: BackendSession = {
      backend,
      connection,
      client: innerClient
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
    onReady: (listener: (sessionId: string) => void): void => void readyListeners.push(listener),
    onTranscriptEvent(listener: (event: TranscriptEvent) => void): () => void {
      transcriptListeners.add(listener);
      return () => {
        transcriptListeners.delete(listener);
      };
    },
    ensureStarted: async (): Promise<void> => void (await ensureSession()),
    submit: async (params: StreamSubmitParams): Promise<void> =>
      void (await withClient((client) => client.submit(params))),
    clearConversation: async (): Promise<void> =>
      void (await withClient((client) => client.clearConversation())),
    cancelTurn: async (turnId: string): Promise<void> =>
      void (await withClient((client) => client.cancelTurn(turnId))),
    gitStatus: (): Promise<string | null> => withClient((client) => client.gitStatus()),
    listProviders: (): Promise<ProviderListResult> => withClient((client) => client.listProviders()),
    getActiveSelection: (): Promise<ActiveSelectionResult> =>
      withClient((client) => client.getActiveSelection()),
    setActiveSelection: async (providerId: string, modelId: string): Promise<void> =>
      void (await withClient((client) => client.setActiveSelection(providerId, modelId))),
    clearProviderKey: async (providerId: string): Promise<void> =>
      void (await withClient((client) => client.clearProviderKey(providerId))),
    async setProviderKey(params: SetKeyParams): Promise<SetKeyResult> {
      return withClient((client) => client.setProviderKey(params));
    },
    async listModels(providerId: string): Promise<ModelListResult> {
      return withClient((client) => client.listModels(providerId));
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
