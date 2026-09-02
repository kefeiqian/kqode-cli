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
  MemoryShowResult,
  ThemeGetResult,
  ThemeSetResult
} from '@contracts/backend/index.ts';
export { BackendLifecycleState };
export type { BackendClientHandle, BackendClientOptions };
type BackendSession = {
  backend: LaunchedBackend;
  connection: MessageConnection;
  client: MessageConnectionBackendClient;
  generation: number;
};
type BackendTransition = {
  workspaceCwd: string | undefined;
  promise: Promise<BackendSession>;
  kind: 'start' | 'relaunch';
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
  let starting: BackendTransition | null = null;
  let generationCounter = 0;
  let activeGeneration = 0;
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
  const discardedSubmitError = (): BackendClientError =>
    new BackendClientError(
      BackendErrorKind.Discarded,
      'prompt discarded because the session switched before it could be submitted'
    );
  const nextGeneration = (): number => {
    generationCounter += 1;
    activeGeneration = generationCounter;
    return generationCounter;
  };
  const disposeSession = (target: BackendSession): void => {
    target.client.failInFlight('backend connection closed before the turn completed');
    target.connection.dispose();
    target.backend.dispose();
  };
  const teardown = (nextState: BackendLifecycleState): void => {
    const current = session;
    session = null;
    state = nextState;
    if (current !== null) {
      disposeSession(current);
      detachTranscriptEvents?.();
      detachTranscriptEvents = undefined;
    }
  };
  const markDead = (generation: number): void => {
    if (generation !== activeGeneration) {
      return;
    }
    if (state === BackendLifecycleState.Closing || state === BackendLifecycleState.Dead) {
      return;
    }
    teardown(BackendLifecycleState.Dead);
  };
  const launchSession = async (
    nextWorkspaceCwd: string | undefined,
    generation: number
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
      onFatal: () => markDead(generation)
    });
    const innerClient = createMessageConnectionClient(connection, {
      requestTimeoutMs,
      validationRequestTimeoutMs
    });
    return {
      opened: {
        backend,
        connection,
        client: innerClient,
        generation
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
  const adoptStartedSession = (opened: BackendSession, sessionId: string): BackendSession => {
    attachTranscriptListener(opened.client);
    session = opened;
    state = BackendLifecycleState.Ready;
    announceReady(sessionId);
    return opened;
  };
  const start = async (targetWorkspaceCwd: string | undefined): Promise<BackendSession> => {
    const generation = nextGeneration();
    state = BackendLifecycleState.Starting;
    try {
      const { opened, sessionId } = await launchSession(targetWorkspaceCwd, generation);
      if (generation !== activeGeneration || state !== BackendLifecycleState.Starting) {
        disposeSession(opened);
        throw abortedError();
      }
      workspaceCwd = targetWorkspaceCwd;
      return adoptStartedSession(opened, sessionId);
    } catch (error) {
      if (generation === activeGeneration && state === BackendLifecycleState.Starting) {
        state = BackendLifecycleState.Dead;
      }
      throw error;
    }
  };
  const beginStart = (
    targetWorkspaceCwd: string | undefined,
    kind: BackendTransition['kind'] = 'start'
  ): Promise<BackendSession> => {
    let promise!: Promise<BackendSession>;
    promise = start(targetWorkspaceCwd).finally(() => {
      if (starting?.promise === promise) {
        starting = null;
      }
    });
    starting = { workspaceCwd: targetWorkspaceCwd, promise, kind };
    return promise;
  };
  const ensureSession = (): Promise<BackendSession> => {
    if (disposed) {
      return Promise.reject(disposedError());
    }
    if (session !== null && state === BackendLifecycleState.Ready) {
      return Promise.resolve(session);
    }
    if (starting !== null && starting.workspaceCwd === workspaceCwd) {
      return starting.promise;
    }
    return beginStart(workspaceCwd);
  };
  const submit = async (params: StreamSubmitParams): Promise<void> => {
    const transition = starting?.kind === 'relaunch' ? starting : null;
    if (transition !== null) {
      await transition.promise;
      throw discardedSubmitError();
    }
    await withClient((client) => client.submit(params));
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
        markDead(activeGeneration);
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
        await beginStart(nextWorkspaceCwd, 'relaunch');
        return;
      }
      const previousSession = session;
      const previousWorkspaceCwd = workspaceCwd;
      const previousGeneration = previousSession.generation;
      const generation = nextGeneration();
      state = BackendLifecycleState.Starting;
      workspaceCwd = nextWorkspaceCwd;
      let promise!: Promise<BackendSession>;
      promise = (async () => {
        try {
          const { opened, sessionId } = await launchSession(nextWorkspaceCwd, generation);
          if (generation !== activeGeneration || state !== BackendLifecycleState.Starting) {
            disposeSession(opened);
            throw abortedError();
          }
          disposeSession(previousSession);
          detachTranscriptEvents?.();
          detachTranscriptEvents = undefined;
          return adoptStartedSession(opened, sessionId);
        } catch (error) {
          if (generation === activeGeneration) {
            session = previousSession;
            workspaceCwd = previousWorkspaceCwd;
            activeGeneration = previousGeneration;
            state = BackendLifecycleState.Ready;
          }
          throw error;
        } finally {
          if (starting?.promise === promise) {
            starting = null;
          }
        }
      })();
      starting = { workspaceCwd: nextWorkspaceCwd, promise, kind: 'relaunch' };
      await promise;
    },
    submit,
    clearConversation: async (): Promise<void> =>
      void (await withClient((client) => client.clearConversation())),
    cancelTurn: async (turnId: string): Promise<void> =>
      void (await withClient((client) => client.cancelTurn(turnId))),
    stopTurn: async (): Promise<void> =>
      void (await withClient((client) => client.stopTurn())),
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
    async getTheme(): Promise<ThemeGetResult> {
      return withClient((client) => client.getTheme());
    },
    async setTheme(themeId: string): Promise<ThemeSetResult> {
      return withClient((client) => client.setTheme(themeId));
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
