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

/** Params the TUI submits; the client generates the wire `turnId` internally. */
export type StreamSubmitParams = {
  text: string;
};

/** Callbacks invoked while a streamed turn is in flight. */
export type StreamCallbacks = {
  /** Called for each chunk of assistant text as it streams in. */
  onDelta: (delta: string) => void;
};

/** Terminal outcome of a streamed turn (transport failures reject instead). */
export type StreamOutcome =
  | { kind: 'completed'; text: string; finishReason: string | null }
  | { kind: 'error'; errorKind: string; message: string }
  | { kind: 'needsConfiguration' };

/**
 * Narrow backend seam the TUI uses for streaming chat turns.
 *
 * `submitStreaming` streams assistant text through `callbacks.onDelta` and
 * resolves with a {@link StreamOutcome} when the turn ends (completed, provider
 * error, or needs-configuration). It rejects with a {@link BackendClientError}
 * only for transport/timeout failures; display components depend only on this
 * interface so process and protocol mechanics stay out of the render tree.
 */
export type BackendClient = {
  submitStreaming(params: StreamSubmitParams, callbacks: StreamCallbacks): Promise<StreamOutcome>;
};
