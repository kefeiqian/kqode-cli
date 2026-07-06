import { type MessageConnection, ResponseError } from 'vscode-jsonrpc';
import {
  BackendClientError,
  BackendErrorKind,
  MODEL_LIST_STATUS_FAILED,
  SET_KEY_OUTCOME_UNREACHABLE
} from '@contracts/backend/index.ts';
import type { ModelListResult, SetKeyParams, SetKeyResult } from '@contracts/backend/index.ts';
import {
  providerModelsRequest,
  providerSetKeyRequest
} from '@backend/protocol/providerProtocol.ts';
import { withRequestTimeout } from '@backend/client/backendClientErrors.ts';

/** Sends non-fatal provider key validation. */
export async function setProviderKey(
  connection: MessageConnection,
  params: SetKeyParams,
  timeoutMs: number
): Promise<SetKeyResult> {
  try {
    return await withRequestTimeout(connection.sendRequest(providerSetKeyRequest, params), timeoutMs);
  } catch (error) {
    if (isRecoverableValidationError(error)) {
      return { outcome: SET_KEY_OUTCOME_UNREACHABLE, selectedModel: null };
    }
    throw toBackendClientError(error);
  }
}

/** Sends non-fatal provider model-list loading. */
export async function listModels(
  connection: MessageConnection,
  providerId: string,
  timeoutMs: number
): Promise<ModelListResult> {
  try {
    return await withRequestTimeout(
      connection.sendRequest(providerModelsRequest, { providerId }),
      timeoutMs
    );
  } catch (error) {
    if (isRecoverableValidationError(error)) {
      return { status: MODEL_LIST_STATUS_FAILED, models: [] };
    }
    throw toBackendClientError(error);
  }
}

function isRecoverableValidationError(error: unknown): boolean {
  return (
    error instanceof BackendClientError && error.kind === BackendErrorKind.Timeout
  );
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
