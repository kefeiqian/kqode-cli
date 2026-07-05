import { NotificationType, NotificationType0, RequestType } from 'vscode-jsonrpc';
import {
  BACKEND_READY_METHOD,
  MESSAGE_SUBMIT_METHOD,
  TOKEN_DELTA_METHOD,
  TURN_END_METHOD,
  TURN_ERROR_METHOD
} from '@contracts/backend/index.ts';
import type {
  MessageSubmitParams,
  MessageSubmitResult,
  TokenDeltaParams,
  TurnEndParams,
  TurnErrorParams
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

/**
 * Typed descriptor for the backend's one-shot readiness notification.
 *
 * The backend sends this parameterless notification the moment it can serve
 * JSON-RPC; the client resolves startup on it (see `waitForBackendReady`). The
 * method name comes from the same dependency-free `@contracts` seam so the Rust
 * and TypeScript sides stay in lockstep.
 */
export const backendReadyNotification = new NotificationType0(BACKEND_READY_METHOD);

/** Streamed assistant-text chunk for an in-flight turn. */
export const tokenDeltaNotification = new NotificationType<TokenDeltaParams>(TOKEN_DELTA_METHOD);

/** Terminal "turn finished" notification carrying the finish reason. */
export const turnEndNotification = new NotificationType<TurnEndParams>(TURN_END_METHOD);

/** Terminal "turn failed" notification carrying a sanitized provider error. */
export const turnErrorNotification = new NotificationType<TurnErrorParams>(TURN_ERROR_METHOD);
