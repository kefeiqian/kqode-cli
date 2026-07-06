import { NotificationType, RequestType, RequestType0 } from 'vscode-jsonrpc';
import {
  BACKEND_READY_METHOD,
  CONVERSATION_CLEAR_METHOD,
  GIT_STATUS_METHOD,
  MESSAGE_SUBMIT_METHOD,
  TOKEN_DELTA_METHOD,
  TURN_ACTIVATED_METHOD,
  TURN_CANCEL_METHOD,
  TURN_ENQUEUED_METHOD,
  TURN_SETTLED_METHOD
} from '@contracts/backend/index.ts';
import type {
  ActivatedParams,
  BackendReadyParams,
  ConversationClearResult,
  EnqueuedParams,
  GitStatusResult,
  MessageSubmitParams,
  MessageSubmitResult,
  SettledParams,
  TokenDeltaParams,
  TurnCancelParams,
  TurnCancelResult
} from '@contracts/backend/index.ts';

/**
 * Typed request descriptor for `kqode.message.submit`.
 *
 * Routing the method through a single `RequestType` keeps the KQode-owned method
 * name out of call sites while `vscode-jsonrpc` owns request IDs and framing. The
 * method name and wire shapes come from the dependency-free `@contracts` seam.
 */
export const messageSubmitRequest = new RequestType<MessageSubmitParams, MessageSubmitResult, void>(
  MESSAGE_SUBMIT_METHOD
);

/** Typed descriptor for the parameterless `kqode.conversation.clear` request. */
export const conversationClearRequest = new RequestType0<ConversationClearResult, void>(
  CONVERSATION_CLEAR_METHOD
);

/** Typed request descriptor for `kqode.turn.cancel`. */
export const turnCancelRequest = new RequestType<TurnCancelParams, TurnCancelResult, void>(
  TURN_CANCEL_METHOD
);

/**
 * Typed descriptor for the parameterless `kqode.git.status` request.
 *
 * The backend queries `git` in its own workspace cwd, so the request carries no
 * params; it resolves with the formatted label (or `null`). The method name and
 * result shape come from the dependency-free `@contracts` seam.
 */
export const gitStatusRequest = new RequestType0<GitStatusResult, void>(GIT_STATUS_METHOD);

/**
 * Typed descriptor for the backend's one-shot readiness notification.
 *
 * The backend sends this the moment it can serve JSON-RPC, carrying the session
 * id it minted for this spawn; the client resolves startup on it (see
 * `waitForBackendReady`). The method name and params shape come from the
 * dependency-free `@contracts` seam so the Rust and TypeScript sides stay in
 * lockstep.
 */
export const backendReadyNotification = new NotificationType<BackendReadyParams>(
  BACKEND_READY_METHOD
);

/** Streamed assistant-text chunk for an in-flight turn. */
export const tokenDeltaNotification = new NotificationType<TokenDeltaParams>(TOKEN_DELTA_METHOD);

/** Queue lifecycle notification emitted when a turn is enqueued. */
export const turnEnqueuedNotification = new NotificationType<EnqueuedParams>(TURN_ENQUEUED_METHOD);

/** Queue lifecycle notification emitted when a pending turn becomes active. */
export const turnActivatedNotification = new NotificationType<ActivatedParams>(
  TURN_ACTIVATED_METHOD
);

/** Unified terminal result notification for a turn. */
export const turnSettledNotification = new NotificationType<SettledParams>(TURN_SETTLED_METHOD);
