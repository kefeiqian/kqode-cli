/**
 * Wire contract for backend-owned local session resume APIs.
 */

export const SESSION_LIST_METHOD = 'kqode.session.list';
export const SESSION_RESUME_METHOD = 'kqode.session.resume';

export const SESSION_STATUS_CURRENT = 'Current';
export const SESSION_STATUS_IDLE = 'Idle';

export type SessionStatus = typeof SESSION_STATUS_CURRENT | typeof SESSION_STATUS_IDLE;

export type SessionSummary = {
  sessionId: string;
  summary: string;
  status: SessionStatus;
  modifiedAt: number;
  createdAt: number;
  folder: string;
};

export type SessionListResult = {
  sessions: SessionSummary[];
};

export type SessionResumeParams = {
  sessionId: string;
};

export type ResumedTurnResult = {
  kind: SettledKind;
  text: string | null;
  finishReason: string | null;
  errorKind: string | null;
  message: string | null;
};

export type ResumedTurn = {
  turnId: string;
  seq: number;
  prompt: string;
  result: ResumedTurnResult;
};

export type SessionResumeResult = {
  sessionId: string;
  workspaceCwd: string;
  canonicalWorkspaceCwd: string;
  turns: ResumedTurn[];
};
import type { SettledKind } from '@contracts/backend/messages.ts';
