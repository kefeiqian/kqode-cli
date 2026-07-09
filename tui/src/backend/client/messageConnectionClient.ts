import { type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import {
  BackendClientError,
  BackendErrorKind,
  SETTLED_KIND_ERROR
} from '@contracts/backend/index.ts';
import type { BackendClient, TranscriptEvent } from '@contracts/backend/index.ts';
import {
  compactionStatusNotification,
  conversationClearRequest,
  gitStatusRequest,
  messageSubmitRequest,
  tokenDeltaNotification,
  turnActivatedNotification,
  turnCancelRequest,
  turnEnqueuedNotification,
  turnSettledNotification
} from '@backend/protocol/messageProtocol.ts';
import {
  providerClearKeyRequest,
  providerListRequest,
  selectionGetRequest,
  selectionSetRequest
} from '@backend/protocol/providerProtocol.ts';
import {
  sessionListRequest,
  sessionResumeRequest
} from '@backend/protocol/sessionProtocol.ts';
import { themeGetRequest, themeSetRequest } from '@backend/protocol/themeProtocol.ts';
import {
  memoryAddRequest,
  memoryEditRequest,
  memoryForgetRequest,
  memoryInboxApplyRequest,
  memoryInboxListRequest,
  memoryInboxUndoRequest,
  memoryListRequest,
  memoryReloadRequest,
  memoryShowRequest
} from '@backend/protocol/memoryProtocol.ts';
import { listModels, setProviderKey } from '@backend/client/validationRequests.ts';
import {
  isFatalBackendError,
  withRequestTimeout
} from '@backend/client/backendClientErrors.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS, VALIDATION_REQUEST_TIMEOUT_MS } from '@constants/backend.ts';
/** Composition inputs for {@link createMessageConnectionClient}. */
export type MessageConnectionClientOptions = {
  /** Ceiling for request/ack responses. */
  requestTimeoutMs?: number;
  /** Non-fatal ceiling for provider validation/model-list requests. */
  validationRequestTimeoutMs?: number;
};
export type MessageConnectionBackendClient = BackendClient & {
  failInFlight(reason: string): void;
};
/** Builds a {@link BackendClient} over an established JSON-RPC connection. */
export function createMessageConnectionClient(
  connection: MessageConnection,
  options: MessageConnectionClientOptions = {}
): MessageConnectionBackendClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const validationRequestTimeoutMs =
    options.validationRequestTimeoutMs ?? VALIDATION_REQUEST_TIMEOUT_MS;
  const handlers = new Set<(event: TranscriptEvent) => void>();
  const inFlightTurnIds = new Set<string>();
  const emit = (event: TranscriptEvent): void => {
    if (event.type === 'settled') {
      inFlightTurnIds.delete(event.turnId);
    }
    for (const handler of handlers) {
      handler(event);
    }
  };
  connection.onNotification(turnEnqueuedNotification, (event) =>
    emit({ type: 'enqueued', ...event })
  );
  connection.onNotification(turnActivatedNotification, (event) =>
    emit({ type: 'activated', ...event })
  );
  connection.onNotification(tokenDeltaNotification, (event) =>
    emit({ type: 'tokenDelta', ...event })
  );
  connection.onNotification(turnSettledNotification, (event) =>
    emit({ type: 'settled', ...event })
  );
  connection.onNotification(compactionStatusNotification, (event) =>
    emit({ type: 'compactionStatus', ...event })
  );
  const failInFlight = (reason: string): void => {
    for (const turnId of [...inFlightTurnIds]) {
      emit(transportFailureEvent(turnId, reason));
    }
  };
  connection.onClose(() => failInFlight('backend connection closed before the turn completed'));
  connection.onError((error) => {
    const clientError = toBackendClientError(error);
    if (isFatalBackendError(clientError)) {
      failInFlight(clientError.message);
    }
  });
  return {
    async submit({ turnId, text }): Promise<void> {
      inFlightTurnIds.add(turnId);
      try {
        await withRequestTimeout(
          connection.sendRequest(messageSubmitRequest, { text, turnId }),
          requestTimeoutMs
        );
      } catch (error) {
        inFlightTurnIds.delete(turnId);
        throw toBackendClientError(error);
      }
    },
    onTranscriptEvent(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async clearConversation(): Promise<void> {
      await okRequest(connection.sendRequest(conversationClearRequest), requestTimeoutMs);
    },
    async cancelTurn(turnId: string): Promise<void> {
      await okRequest(connection.sendRequest(turnCancelRequest, { turnId }), requestTimeoutMs);
    },
    async gitStatus(): Promise<string | null> {
      const result = await request(connection.sendRequest(gitStatusRequest), requestTimeoutMs);
      return result.label;
    },
    async listProviders() {
      return request(connection.sendRequest(providerListRequest), requestTimeoutMs);
    },
    async getActiveSelection() {
      return request(connection.sendRequest(selectionGetRequest), requestTimeoutMs);
    },
    async setActiveSelection(providerId: string, modelId: string) {
      await okRequest(
        connection.sendRequest(selectionSetRequest, { providerId, modelId }),
        requestTimeoutMs
      );
    },
    async clearProviderKey(providerId: string) {
      await okRequest(connection.sendRequest(providerClearKeyRequest, { providerId }), requestTimeoutMs);
    },
    async setProviderKey(params) {
      return setProviderKey(connection, params, validationRequestTimeoutMs);
    },
    async listModels(providerId) {
      return listModels(connection, providerId, validationRequestTimeoutMs);
    },
    async getTheme() {
      return request(connection.sendRequest(themeGetRequest), requestTimeoutMs);
    },
    async setTheme(themeId: string) {
      return request(connection.sendRequest(themeSetRequest, { themeId }), requestTimeoutMs);
    },
    async listSessions() {
      return request(connection.sendRequest(sessionListRequest), requestTimeoutMs);
    },
    async resumeSession(params) {
      return request(connection.sendRequest(sessionResumeRequest, params), requestTimeoutMs);
    },
    async listMemory(params) {
      return request(connection.sendRequest(memoryListRequest, params), requestTimeoutMs);
    },
    async showMemory(params) {
      return request(connection.sendRequest(memoryShowRequest, params), requestTimeoutMs);
    },
    async addMemory(params) {
      return request(connection.sendRequest(memoryAddRequest, params), requestTimeoutMs);
    },
    async editMemory(params) {
      return request(connection.sendRequest(memoryEditRequest, params), requestTimeoutMs);
    },
    async forgetMemory(params) {
      return request(connection.sendRequest(memoryForgetRequest, params), requestTimeoutMs);
    },
    async reloadMemory() {
      return request(connection.sendRequest(memoryReloadRequest), requestTimeoutMs);
    },
    async listMemoryInbox(params) {
      return request(connection.sendRequest(memoryInboxListRequest, params), requestTimeoutMs);
    },
    async applyMemoryInbox(params) {
      return request(connection.sendRequest(memoryInboxApplyRequest, params), requestTimeoutMs);
    },
    async undoMemoryInbox(params) {
      return request(connection.sendRequest(memoryInboxUndoRequest, params), requestTimeoutMs);
    },
    failInFlight
  };
}
async function request<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  try {
    return await withRequestTimeout(promise, timeoutMs);
  } catch (error) {
    throw toBackendClientError(error);
  }
}
async function okRequest(promise: Promise<{ ok: boolean }>, timeoutMs: number): Promise<void> {
  const result = await request(promise, timeoutMs);
  if (!result.ok) {
    throw new BackendClientError(BackendErrorKind.Protocol, 'backend rejected request');
  }
}
function transportFailureEvent(turnId: string, message: string): TranscriptEvent {
  return {
    type: 'settled',
    turnId,
    result: {
      kind: SETTLED_KIND_ERROR,
      text: null,
      finishReason: null,
      errorKind: BackendErrorKind.Transport,
      message
    }
  };
}
function toBackendClientError(error: unknown): BackendClientError {
  if (error instanceof BackendClientError) {
    return error;
  }
  if (error instanceof ResponseError) {
    return new BackendClientError(
      BackendErrorKind.Protocol,
      `backend rejected request: ${error.message}`,
      { cause: error }
    );
  }
  return new BackendClientError(
    BackendErrorKind.Transport,
    `backend connection failed: ${errorMessage(error)}`,
    { cause: error }
  );
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
