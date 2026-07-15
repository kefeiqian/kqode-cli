import { randomUUID } from 'node:crypto';
import { type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { SUBMIT_STATUS_NEEDS_CONFIGURATION } from '@contracts/backend/index.ts';
import type { BackendClient, SubmitOutcome, SubmitParams } from '@contracts/backend/index.ts';
import { gitStatusRequest, messageSubmitRequest } from '@backend/protocol/messageProtocol.ts';
import { withRequestTimeout } from '@backend/client/backendClientErrors.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '@constants/backend.ts';

/** Composition inputs for {@link createMessageConnectionClient}. */
export type MessageConnectionClientOptions = {
  /** Ceiling for the submit ack response. */
  requestTimeoutMs?: number;
};

/**
 * Builds a {@link BackendClient} over an already-established JSON-RPC connection.
 *
 * The caller owns the connection lifecycle. `submit` sends the prompt and
 * resolves on the backend's ack; in this bootstrap slice that ack is always
 * `needsConfiguration` because no provider is wired yet. Transport/timeout
 * failures reject with a {@link BackendClientError} (connection death is also
 * surfaced to the caller through its own fatal-teardown listeners), so this can
 * be exercised over in-memory streams without a Rust child process. The
 * streaming notification channel arrives with the provider PR.
 */
export function createMessageConnectionClient(
  connection: MessageConnection,
  options: MessageConnectionClientOptions = {}
): BackendClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  return {
    async submit(params: SubmitParams): Promise<SubmitOutcome> {
      // `turnId` is client-generated so the turn has a stable identity the ack
      // echoes back; the provider PR reuses it to correlate stream notifications.
      const turnId = randomUUID();
      try {
        const ack = await withRequestTimeout(
          connection.sendRequest(messageSubmitRequest, { text: params.text, turnId }),
          requestTimeoutMs
        );
        if (ack.status === SUBMIT_STATUS_NEEDS_CONFIGURATION) {
          return { kind: 'needsConfiguration' };
        }
        throw new BackendClientError(
          BackendErrorKind.Protocol,
          `backend returned an unsupported submit status \`${ack.status}\``
        );
      } catch (error) {
        throw toBackendClientError('message submit', error);
      }
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
