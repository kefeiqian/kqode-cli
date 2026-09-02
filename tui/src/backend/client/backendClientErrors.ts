import { BackendClientError, BackendErrorKind } from '@contracts/backend/index.ts';

/**
 * Rejects with a `timeout` error when `promise` outlives `timeoutMs`.
 *
 * The underlying promise keeps running, but a late settlement is ignored: the
 * client treats the timeout as fatal and disposes the backend connection.
 */
export function withRequestTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new BackendClientError(
          BackendErrorKind.Timeout,
          `backend request timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Whether `error` should tear the connection down instead of being recoverable. */
export function isFatalBackendError(error: unknown): boolean {
  return (
    error instanceof BackendClientError &&
    error.kind !== BackendErrorKind.Protocol &&
    error.kind !== BackendErrorKind.Discarded
  );
}

/** Normalizes any thrown launch failure into a `launch`-kind {@link BackendClientError}. */
export function toLaunchError(error: unknown): BackendClientError {
  if (error instanceof BackendClientError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new BackendClientError(BackendErrorKind.Launch, `failed to launch backend: ${message}`, {
    cause: error
  });
}
