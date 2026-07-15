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

/** Params the TUI submits. */
export type SubmitParams = {
  text: string;
};

/**
 * Terminal outcome of a submitted prompt in this bootstrap slice.
 *
 * No provider is wired yet, so every accepted submit resolves
 * `needsConfiguration`. Streaming outcomes (completed assistant text, provider
 * errors) arrive with the provider PR. Transport/timeout failures reject with a
 * {@link BackendClientError} instead of resolving.
 */
export type SubmitOutcome = { kind: 'needsConfiguration' };

/** Workspace source-control status already formatted by the Rust backend. */
export type GitStatus = {
  label: string;
  pullRequestLabel?: string;
  pullRequestUrl?: string;
};

/**
 * The current branch's pull request, formatted by the Rust backend: a `#N`
 * `label` and (when available) its web `url`.
 */
export type PullRequestStatus = {
  label: string;
  url?: string;
};

/**
 * Narrow backend seam the TUI uses to submit chat turns.
 *
 * `submit` sends the prompt and resolves with a {@link SubmitOutcome} when the
 * backend acks. In this bootstrap slice that outcome is always
 * `needsConfiguration` (no provider is wired yet); it rejects with a
 * {@link BackendClientError} only for transport/timeout failures. Display
 * components depend only on this interface so process and protocol mechanics stay
 * out of the render tree.
 */
export type BackendClient = {
  submit(params: SubmitParams): Promise<SubmitOutcome>;
  /**
   * Fetches the workspace working-tree label, or `null` when the workspace is
   * not a git repository or `git` could not be queried. Refreshed after every
   * turn. Rejects with a {@link BackendClientError} on transport/timeout
   * failure. The backend formats display segments; the TUI only wraps them.
   */
  gitStatus(): Promise<GitStatus | null>;
  /**
   * Fetches the current branch's GitHub pull request (label + URL), or `null`
   * when there is no PR (or `gh` could not be queried). Fetched once at bootstrap
   * because a branch's PR is static for the session. Rejects with a
   * {@link BackendClientError} on transport/timeout failure.
   */
  pullRequest(): Promise<PullRequestStatus | null>;
};
