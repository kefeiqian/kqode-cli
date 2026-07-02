import { NotificationType0, RequestType } from 'vscode-jsonrpc';
import { BACKEND_READY_METHOD, MESSAGE_SUBMIT_METHOD } from '@contracts/backend/index.ts';
import type { MessageSubmitParams, MessageSubmitResult } from '@contracts/backend/index.ts';

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
