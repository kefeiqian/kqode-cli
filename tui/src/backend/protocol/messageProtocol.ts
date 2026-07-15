import { NotificationType0, RequestType, RequestType0 } from 'vscode-jsonrpc';
import {
  BACKEND_READY_METHOD,
  GIT_STATUS_METHOD,
  MESSAGE_SUBMIT_METHOD,
  PULL_REQUEST_METHOD
} from '@contracts/backend/index.ts';
import type {
  GitStatusResult,
  MessageSubmitParams,
  MessageSubmitResult,
  PullRequestResult
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
 * Typed descriptor for the parameterless `kqode.git.status` request.
 *
 * The backend queries `git` in its own workspace cwd, so the request carries no
 * params; it resolves with the formatted label (or `null`). The method name and
 * result shape come from the dependency-free `@contracts` seam.
 */
export const gitStatusRequest = new RequestType0<GitStatusResult, void>(GIT_STATUS_METHOD);

/**
 * Typed descriptor for the parameterless `kqode.git.pullRequest` request.
 *
 * The backend runs `gh` in its own workspace cwd, so the request carries no
 * params; it resolves with the PR label + URL (or nulls). Fetched once at
 * bootstrap because a branch's PR is static for the session. The method name and
 * result shape come from the dependency-free `@contracts` seam.
 */
export const pullRequestRequest = new RequestType0<PullRequestResult, void>(PULL_REQUEST_METHOD);

/**
 * Typed descriptor for the backend's one-shot readiness notification.
 *
 * The backend sends this parameterless notification the moment it can serve
 * JSON-RPC; the client resolves startup on it (see `waitForBackendReady`). The
 * method name comes from the same dependency-free `@contracts` seam so the Rust
 * and TypeScript sides stay in lockstep.
 */
export const backendReadyNotification = new NotificationType0(BACKEND_READY_METHOD);
