import { randomUUID } from 'node:crypto';
import { type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { SUBMIT_STATUS_NEEDS_CONFIGURATION } from '@contracts/backend/index.ts';
import type {
  BackendClient,
  StreamCallbacks,
  StreamOutcome,
  StreamSubmitParams
} from '@contracts/backend/index.ts';
import {
  gitStatusRequest,
  messageSubmitRequest,
  tokenDeltaNotification,
  turnEndNotification,
  turnErrorNotification
} from '@backend/protocol/messageProtocol.ts';
import { withRequestTimeout } from '@backend/client/backendClientErrors.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS } from '@constants/backend.ts';

/** Per-turn hooks the notification handlers dispatch to, keyed by `turnId`. */
type ActiveTurn = {
  onDelta: (delta: string) => void;
  complete: (finishReason: string | null) => void;
  fail: (errorKind: string, message: string) => void;
  die: (reason: string) => void;
};

/** Composition inputs for {@link createMessageConnectionClient}. */
export type MessageConnectionClientOptions = {
  /** Ceiling for the streaming ack response (not the whole stream). */
  requestTimeoutMs?: number;
  /** Ceiling while waiting for the next streaming notification after ack/delta. */
  streamIdleTimeoutMs?: number;
};

/**
 * Builds a {@link BackendClient} over an already-established JSON-RPC connection.
 *
 * The caller owns the connection lifecycle. Streamed turns are correlated by a
 * client-generated `turnId`: the notification handlers are registered before the
 * submit request is sent, so a `tokenDelta`/`turnEnd` that races ahead of the ack
 * still matches. A turn resolves on `kqode/turnEnd` (completed) or
 * `kqode/turnError`, and rejects only if the ack times out or the connection
 * dies mid-stream — so it can be exercised over in-memory streams without a Rust
 * child process.
 */
export function createMessageConnectionClient(
  connection: MessageConnection,
  options: MessageConnectionClientOptions = {}
): BackendClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  const activeTurns = new Map<string, ActiveTurn>();

  connection.onNotification(tokenDeltaNotification, ({ turnId, delta }) => {
    activeTurns.get(turnId)?.onDelta(delta);
  });
  connection.onNotification(turnEndNotification, ({ turnId, finishReason }) => {
    activeTurns.get(turnId)?.complete(finishReason);
  });
  connection.onNotification(turnErrorNotification, ({ turnId, errorKind, message }) => {
    activeTurns.get(turnId)?.fail(errorKind, message);
  });

  const failAllTurns = (reason: string): void => {
    for (const turn of [...activeTurns.values()]) {
      turn.die(reason);
    }
  };
  connection.onClose(() => failAllTurns('backend connection closed before the turn completed'));
  connection.onError(() => failAllTurns('backend connection errored before the turn completed'));

  return {
    submitStreaming(params: StreamSubmitParams, callbacks: StreamCallbacks): Promise<StreamOutcome> {
      const turnId = randomUUID();
      return new Promise<StreamOutcome>((resolve, reject) => {
        let settled = false;
        let text = '';
        let streamIdleTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (settle: () => void): void => {
          if (settled) {
            return;
          }
          settled = true;
          if (streamIdleTimer !== undefined) {
            clearTimeout(streamIdleTimer);
          }
          activeTurns.delete(turnId);
          settle();
        };
        const refreshStreamIdleTimer = (): void => {
          if (streamIdleTimer !== undefined) {
            clearTimeout(streamIdleTimer);
          }
          streamIdleTimer = setTimeout(() => {
            finish(() =>
              reject(
                new BackendClientError(
                  BackendErrorKind.Timeout,
                  `backend stream idled for ${streamIdleTimeoutMs}ms before the turn completed`
                )
              )
            );
          }, streamIdleTimeoutMs);
        };

        activeTurns.set(turnId, {
          onDelta: (delta) => {
            text += delta;
            callbacks.onDelta(delta);
            refreshStreamIdleTimer();
          },
          complete: (finishReason) =>
            finish(() => resolve({ kind: 'completed', text, finishReason })),
          fail: (errorKind, message) => finish(() => resolve({ kind: 'error', errorKind, message })),
          die: (reason) =>
            finish(() => reject(new BackendClientError(BackendErrorKind.Transport, reason)))
        });

        withRequestTimeout(
          connection.sendRequest(messageSubmitRequest, { text: params.text, turnId }),
          requestTimeoutMs
        ).then(
          (ack) => {
            if (ack.status === SUBMIT_STATUS_NEEDS_CONFIGURATION) {
              finish(() => resolve({ kind: 'needsConfiguration' }));
              return;
            }
            // Otherwise the turn is streaming: wait for turnEnd/turnError, but
            // keep a bounded idle timer so the prompt queue cannot wedge forever.
            refreshStreamIdleTimer();
          },
          (error: unknown) => finish(() => reject(toBackendClientError('message submit', error)))
        );
      });
    },
    async gitStatus() {
      try {
        const result = await withRequestTimeout(
          connection.sendRequest(gitStatusRequest),
          requestTimeoutMs
        );
        return result.label === null
          ? null
          : {
              label: result.label,
              pullRequestLabel: result.pullRequestLabel ?? undefined,
              pullRequestUrl: result.pullRequestUrl ?? undefined
            };
      } catch (error) {
        throw toBackendClientError('git status', error);
      }
    }
  };
}

function toBackendClientError(requestName: string, error: unknown): BackendClientError {
  if (error instanceof BackendClientError) {
    return error;
  }

  if (error instanceof ResponseError) {
    return new BackendClientError(
      BackendErrorKind.Protocol,
      `backend rejected ${requestName}: ${error.message}`,
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
