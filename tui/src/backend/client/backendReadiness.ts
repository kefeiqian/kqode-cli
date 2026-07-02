import { type MessageConnection } from 'vscode-jsonrpc';
import type { Disposable } from 'vscode-jsonrpc';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node';
import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';
import { backendReadyNotification } from '@backend/protocol/messageProtocol.ts';
import type { LaunchedBackend } from '@backend/process/backendProcess.ts';

/**
 * Resolves once `connection` receives the backend readiness notification, or
 * rejects when `startupTimeoutMs` elapses or the transport dies first.
 *
 * Readiness now means "the backend signaled JSON-RPC readiness," not "the OS
 * spawned the process," so this guards the real failure mode of a backend that
 * launches but never speaks. The listeners are registered here and the caller
 * starts `connection.listen()` immediately after, so the one-shot notification
 * can never be missed. Every listener and the timer are torn down on the first
 * settlement, so a late notification, close, or error is ignored.
 *
 * # Errors
 *
 * Rejects with a {@link BackendClientError} of kind `timeout` when the backend
 * does not announce readiness within `startupTimeoutMs`, or kind `transport`
 * when the connection closes or errors before announcing readiness.
 */
export function waitForBackendReady(
  connection: MessageConnection,
  startupTimeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const registrations: Disposable[] = [];
    let settled = false;

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      for (const registration of registrations) {
        registration.dispose();
      }
      action();
    };

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new BackendClientError(
            BackendErrorKind.Timeout,
            `backend did not report JSON-RPC readiness within ${startupTimeoutMs}ms`
          )
        )
      );
    }, startupTimeoutMs);

    const rejectDied = (reason: string): void =>
      settle(() => reject(new BackendClientError(BackendErrorKind.Transport, reason)));

    registrations.push(
      connection.onNotification(backendReadyNotification, () => settle(resolve)),
      connection.onClose(() => rejectDied('backend connection closed before it reported readiness')),
      connection.onError(() => rejectDied('backend connection errored before it reported readiness'))
    );
  });
}

/** Inputs for {@link openReadyConnection}: a launched process and its teardown hook. */
export type OpenReadyConnectionOptions = {
  backend: LaunchedBackend;
  startupTimeoutMs: number;
  /** Invoked when the connection closes/errors or the process exits (fatal teardown). */
  onFatal: () => void;
};

/**
 * Opens a JSON-RPC connection over `backend` and resolves once the backend
 * reports readiness.
 *
 * The fatal-teardown listeners are wired before listening, and the readiness
 * listeners are registered before `listen()` so the one-shot ready notification
 * can never be missed. If readiness times out or the transport dies first, the
 * connection and child process are reclaimed before the rejection propagates, so
 * a failed startup can never leak a backend process.
 *
 * # Errors
 *
 * Rejects with a {@link BackendClientError} of kind `timeout` when the backend
 * never announces readiness, or kind `transport` when the connection dies first.
 */
export async function openReadyConnection({
  backend,
  startupTimeoutMs,
  onFatal
}: OpenReadyConnectionOptions): Promise<MessageConnection> {
  const connection = createMessageConnection(
    new StreamMessageReader(backend.stdout),
    new StreamMessageWriter(backend.stdin)
  );
  connection.onClose(onFatal);
  connection.onError(onFatal);
  backend.onExit(onFatal);

  const ready = waitForBackendReady(connection, startupTimeoutMs);
  connection.listen();
  try {
    await ready;
  } catch (error) {
    connection.dispose();
    backend.dispose();
    throw error;
  }
  return connection;
}
