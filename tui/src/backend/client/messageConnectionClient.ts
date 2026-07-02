import { type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import type { BackendClient } from '@contracts/backend/index.ts';
import { messageSubmitRequest } from '@backend/protocol/messageProtocol.ts';
import type { MessageSubmitParams, MessageSubmitResult } from '@contracts/backend/index.ts';

/**
 * Builds a {@link BackendClient} over an already-established JSON-RPC connection.
 *
 * The caller owns the connection lifecycle; this wrapper only routes the
 * `kqode.message.submit` request and normalizes failures into typed errors, so
 * it can be exercised over in-memory streams without a Rust child process.
 */
export function createMessageConnectionClient(connection: MessageConnection): BackendClient {
  return {
    async submitMessage(params: MessageSubmitParams): Promise<MessageSubmitResult> {
      try {
        return await connection.sendRequest(messageSubmitRequest, params);
      } catch (error) {
        throw toBackendClientError(error);
      }
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
      `backend rejected message submit: ${error.message}`,
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
