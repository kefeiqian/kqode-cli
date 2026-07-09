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
  SessionListResult,
  SessionResumeParams,
  SessionResumeResult,
  SetKeyParams,
  SetKeyResult,
  StreamSubmitParams,
  TranscriptEvent,
  MemoryAddParams,
  MemoryEditParams,
  MemoryForgetParams,
  MemoryForgetResult,
  MemoryInboxApplyParams,
  MemoryInboxApplyResult,
  MemoryInboxListParams,
  MemoryInboxListResult,
  MemoryInboxUndoParams,
  MemoryInboxUndoResult,
  MemoryListParams,
  MemoryListResult,
  MemoryMutationResult,
  MemoryShowParams,
  MemoryShowResult
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
  let workspaceCwd = options.initialWorkspaceCwd;
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
  const launchSession = async (
    nextWorkspaceCwd: string | undefined
  ): Promise<{ opened: BackendSession; sessionId: string }> => {
    let backend: LaunchedBackend;
    try {
      backend = await launch(nextWorkspaceCwd);
    } catch (error) {
      throw toLaunchError(error);
    }
    const { connection, sessionId } = await openReadyConnection({
      backend,
      startupTimeoutMs,
      onFatal: markDead
    });
    const innerClient = createMessageConnectionClient(connection, {
      requestTimeoutMs,
      validationRequestTimeoutMs
    });
    return {
      opened: {
        backend,
        connection,
        client: innerClient
      },
      sessionId
    };
  };
  const attachTranscriptListener = (innerClient: MessageConnectionBackendClient): void => {
    detachTranscriptEvents = innerClient.onTranscriptEvent((event) => {
      for (const listener of transcriptListeners) {
        listener(event);
      }
    });
  };
  const announceReady = (sessionId: string): void => {
    for (const listener of readyListeners) {
      listener(sessionId);
    }
  };
  const start = async (): Promise<BackendSession> => {
    state = BackendLifecycleState.Starting;
    try {
      const { opened, sessionId } = await launchSession(workspaceCwd);
      if (state !== BackendLifecycleState.Starting) {
        opened.connection.dispose();
        opened.backend.dispose();
        throw abortedError();
      }
      attachTranscriptListener(opened.client);
      session = opened;
      state = BackendLifecycleState.Ready;
      announceReady(sessionId);
      return opened;
    } catch (error) {
      if (state === BackendLifecycleState.Starting) {
        state = BackendLifecycleState.Dead;
      }
      throw error;
    }
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
    async relaunch(nextWorkspaceCwd: string): Promise<void> {
      if (disposed) {
        throw disposedError();
      }
      if (state !== BackendLifecycleState.Ready || session === null) {
        workspaceCwd = nextWorkspaceCwd;
        await ensureSession();
        return;
      }
      const previousSession = session;
      const previousWorkspaceCwd = workspaceCwd;
      state = BackendLifecycleState.Starting;
      try {
        const { opened, sessionId } = await launchSession(nextWorkspaceCwd);
        previousSession.client.failInFlight('backend connection closed before the turn completed');
        previousSession.connection.dispose();
        previousSession.backend.dispose();
        detachTranscriptEvents?.();
        detachTranscriptEvents = undefined;
        attachTranscriptListener(opened.client);
        session = opened;
        workspaceCwd = nextWorkspaceCwd;
        state = BackendLifecycleState.Ready;
        announceReady(sessionId);
      } catch (error) {
        session = previousSession;
        workspaceCwd = previousWorkspaceCwd;
        state = BackendLifecycleState.Ready;
        throw error;
      }
    },
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
    async listSessions(): Promise<SessionListResult> {
      return withClient((client) => client.listSessions());
    },
    async resumeSession(params: SessionResumeParams): Promise<SessionResumeResult> {
      return withClient((client) => client.resumeSession(params));
    },
    async listMemory(params: MemoryListParams): Promise<MemoryListResult> {
      return withClient((client) => client.listMemory(params));
    },
    async showMemory(params: MemoryShowParams): Promise<MemoryShowResult> {
      return withClient((client) => client.showMemory(params));
    },
    async addMemory(params: MemoryAddParams): Promise<MemoryMutationResult> {
      return withClient((client) => client.addMemory(params));
    },
    async editMemory(params: MemoryEditParams): Promise<MemoryMutationResult> {
      return withClient((client) => client.editMemory(params));
    },
    async forgetMemory(params: MemoryForgetParams): Promise<MemoryForgetResult> {
      return withClient((client) => client.forgetMemory(params));
    },
    async reloadMemory(): Promise<MemoryListResult> {
      return withClient((client) => client.reloadMemory());
    },
    async listMemoryInbox(params: MemoryInboxListParams): Promise<MemoryInboxListResult> {
      return withClient((client) => client.listMemoryInbox(params));
    },
    async applyMemoryInbox(params: MemoryInboxApplyParams): Promise<MemoryInboxApplyResult> {
      return withClient((client) => client.applyMemoryInbox(params));
    },
    async undoMemoryInbox(params: MemoryInboxUndoParams): Promise<MemoryInboxUndoResult> {
      return withClient((client) => client.undoMemoryInbox(params));
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
