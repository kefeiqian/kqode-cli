import type { MessageSubmitParams, MessageSubmitResult } from '@contracts/backend/messages.ts';

/**
 * Consumer-facing backend seam shared by the `@state` and `@backend` layers.
 *
 * Like its sibling `messages.ts`, this module stays free of `@state`/`@backend`
 * and transport dependencies so both layers can depend on it without forming a
 * cycle. Implementations (process, connection, runtime wiring) live in `@backend`.
 */

/** Backend failure categories surfaced to the TUI. */
export const BackendErrorKind = {
  /** JSON-RPC method/params error or an invalid response shape. */
  Protocol: 'protocol',
  /** Stream framing died or the child stdio closed unexpectedly. */
  Transport: 'transport',
  /** A startup or per-request deadline elapsed. */
  Timeout: 'timeout',
  /** The backend process could not be started. */
  Launch: 'launch'
} as const;

export type BackendErrorKind = (typeof BackendErrorKind)[keyof typeof BackendErrorKind];

/** Error raised when a backend request cannot complete. */
export class BackendClientError extends Error {
  readonly kind: BackendErrorKind;

  constructor(kind: BackendErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackendClientError';
    this.kind = kind;
  }
}

/**
 * Narrow backend seam the TUI uses for the first-slice ACK protocol.
 *
 * `submitMessage` resolves with the backend ACK result or rejects with a
 * {@link BackendClientError}; display components depend only on this interface
 * so process and protocol mechanics stay out of the render tree.
 */
export type BackendClient = {
  submitMessage(params: MessageSubmitParams): Promise<MessageSubmitResult>;
};
