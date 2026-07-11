/**
 * Consumer-facing backend seam shared by the `@state` and `@backend` layers.
 *
 * Like its sibling `messages.ts`, this module stays free of `@state`/`@backend`
 * and transport dependencies so both layers can depend on it without forming a
 * cycle. Implementations (process, connection, runtime wiring) live in `@backend`.
 */

import type {
  ActiveSelectionResult,
  ModelListResult,
  ProviderListResult,
  SetKeyParams,
  SetKeyResult
} from '@contracts/backend/providerMessages.ts';
import type {
  SessionListResult,
  SessionResumeParams,
  SessionResumeResult
} from '@contracts/backend/sessionMessages.ts';
import type {
  MemoryAddParams,
  MemoryEditParams,
  MemoryForgetParams,
  MemoryForgetResult,
  MemoryInboxApplyParams,
  MemoryInboxApplyResult,
  MemoryInboxListParams,
  MemoryInboxListResult,
  MemoryInboxUndoParams,
  MemoryInboxUndoResult,
  MemoryListParams,
  MemoryListResult,
  MemoryMutationResult,
  MemoryShowParams,
  MemoryShowResult
} from '@contracts/backend/memoryMessages.ts';
import type { TurnResult, TurnState } from '@contracts/backend/messages.ts';
import type { ThemeGetResult, ThemeSetResult } from '@contracts/backend/themeMessages.ts';

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

/** Params the TUI submits; callers mint `turnId` before the optimistic echo. */
export type StreamSubmitParams = {
  turnId: string;
  text: string;
};

/** Backend transcript event delivered through the single subscription seam. */
export type TranscriptEvent =
  | { type: 'enqueued'; turnId: string; seq: number; state: TurnState }
  | { type: 'activated'; turnId: string }
  | { type: 'tokenDelta'; turnId: string; delta: string }
  | { type: 'settled'; turnId: string; result: TurnResult }
  | { type: 'compactionStatus'; turnId: string; active: boolean }
  | { type: 'sessionSummaryUpdated'; sessionId: string; summary: string };

/**
 * Narrow backend seam the TUI uses for backend-backed transcript turns.
 *
 * `submit` resolves once the backend accepts the caller-minted `turnId`; token
 * deltas and terminal outcomes arrive through `onTranscriptEvent`.
 */
export type BackendClient = {
  submit(params: StreamSubmitParams): Promise<void>;
  onTranscriptEvent(handler: (event: TranscriptEvent) => void): () => void;
  clearConversation(): Promise<void>;
  cancelTurn(turnId: string): Promise<void>;
  /**
   * Fetches the workspace git status label (e.g. `⎇ main*`), or `null` when the
   * workspace is not a git repository or `git` could not be queried. Rejects
   * with a {@link BackendClientError} on transport/timeout failure. The backend
   * formats the label; the TUI renders it verbatim.
   */
  gitStatus(): Promise<string | null>;
  listProviders(): Promise<ProviderListResult>;
  getActiveSelection(): Promise<ActiveSelectionResult>;
  setActiveSelection(providerId: string, modelId: string): Promise<void>;
  clearProviderKey(providerId: string): Promise<void>;
  setProviderKey(params: SetKeyParams): Promise<SetKeyResult>;
  listModels(providerId: string): Promise<ModelListResult>;
  /** Reads the saved theme id, or null when unset (the TUI resolves its default preset). */
  getTheme(): Promise<ThemeGetResult>;
  /** Persists the selected theme id, returning a saved/invalid/storeFailed outcome. */
  setTheme(themeId: string): Promise<ThemeSetResult>;
  listSessions(): Promise<SessionListResult>;
  resumeSession(params: SessionResumeParams): Promise<SessionResumeResult>;
  /** Lists memory items visible in the current workspace (user + repo + session). */
  listMemory(params: MemoryListParams): Promise<MemoryListResult>;
  /** Reads one memory item including its body. */
  showMemory(params: MemoryShowParams): Promise<MemoryShowResult>;
  /** Adds an active memory item. */
  addMemory(params: MemoryAddParams): Promise<MemoryMutationResult>;
  /** Edits an existing memory item. */
  editMemory(params: MemoryEditParams): Promise<MemoryMutationResult>;
  /** Forgets (removes) a memory item. */
  forgetMemory(params: MemoryForgetParams): Promise<MemoryForgetResult>;
  /** Rebuilds the memory index from file + event-log truth, returning the list. */
  reloadMemory(): Promise<MemoryListResult>;
  /** Lists inbox entries (candidates + automatic audits). */
  listMemoryInbox(params: MemoryInboxListParams): Promise<MemoryInboxListResult>;
  /** Applies a review action (approve/reject/stale) to an inbox entry. */
  applyMemoryInbox(params: MemoryInboxApplyParams): Promise<MemoryInboxApplyResult>;
  /** Undoes an applied automatic memory update. */
  undoMemoryInbox(params: MemoryInboxUndoParams): Promise<MemoryInboxUndoResult>;
};
