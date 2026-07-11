import type { SessionSummary } from '@contracts/backend/index.ts';
import { SESSION_STATUS_CURRENT } from '@contracts/backend/index.ts';

/**
 * Returns the id of the session marked `Current` in a `session.list` result, or
 * `undefined` when none is current.
 *
 * `session.list` only returns resumable sessions, so a `Current` row is both the
 * durable id to resume and proof that the active session is resumable; its
 * absence means the current session has no accepted turn yet.
 */
export function selectCurrentSessionId(
  sessions: readonly SessionSummary[]
): string | undefined {
  return sessions.find((session) => session.status === SESSION_STATUS_CURRENT)?.sessionId;
}
