import { RequestType, RequestType0 } from 'vscode-jsonrpc';
import {
  SESSION_LIST_METHOD,
  SESSION_RESUME_METHOD
} from '@contracts/backend/index.ts';
import type {
  SessionListResult,
  SessionResumeParams,
  SessionResumeResult
} from '@contracts/backend/index.ts';

/** Typed descriptor for the parameterless `kqode.session.list` request. */
export const sessionListRequest = new RequestType0<SessionListResult, void>(
  SESSION_LIST_METHOD
);

/** Typed descriptor for the `kqode.session.resume` request. */
export const sessionResumeRequest = new RequestType<SessionResumeParams, SessionResumeResult, void>(
  SESSION_RESUME_METHOD
);
