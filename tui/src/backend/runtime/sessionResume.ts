import type { createStore } from 'jotai';
import type { SessionResumeResult, SessionSummary } from '@contracts/backend/index.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';
import { sessionGitBaselineAtom, sessionStartedAtAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { refreshGitStatusAtom } from '@state/ui/index.ts';
import { resolveSessionSeed } from '@components/AppExitSummary/resolveSessionSeed.ts';

type Store = ReturnType<typeof createStore>;

export type ResumeRuntimeDeps = {
  store: Store;
  client: RuntimeBackendClient;
  sessionId: string;
  workspaceCwd: string;
};

/**
 * Rebinds the backend runtime into `workspaceCwd` when needed, then attaches
 * the selected durable session and returns its restored transcript payload.
 *
 * If the relaunch succeeds but the backend resume call fails, this helper
 * attempts a best-effort rollback into the previous workspace before
 * rethrowing.
 */
export async function resumeSessionIntoRuntime({
  store,
  client,
  sessionId,
  workspaceCwd
}: ResumeRuntimeDeps): Promise<SessionResumeResult> {
  const previousWorkspaceCwd = store.get(workspaceCwdAtom);
  const previousStartedAt = store.get(sessionStartedAtAtom);
  const previousGitBaseline = store.get(sessionGitBaselineAtom);
  const switchedWorkspace = previousWorkspaceCwd !== workspaceCwd;

  if (switchedWorkspace) {
    await client.relaunch(workspaceCwd);
  }

  try {
    const result = await client.resumeSession({ sessionId });
    const seed = resolveSessionSeed({ cwd: result.workspaceCwd });
    store.set(workspaceCwdAtom, result.workspaceCwd);
    store.set(sessionStartedAtAtom, seed.startedAt);
    store.set(sessionGitBaselineAtom, seed.baseline);
    await store.set(refreshGitStatusAtom);
    return result;
  } catch (error) {
    if (switchedWorkspace) {
      await client.relaunch(previousWorkspaceCwd);
      store.set(workspaceCwdAtom, previousWorkspaceCwd);
      store.set(sessionStartedAtAtom, previousStartedAt);
      store.set(sessionGitBaselineAtom, previousGitBaseline);
      await store.set(refreshGitStatusAtom);
    }
    throw error;
  }
}

/** Thrown when a resume target id is not a known resumable session. */
export class BootResumeError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`No resumable session with id "${sessionId}".`);
    this.name = 'BootResumeError';
    this.sessionId = sessionId;
  }
}

export type ResumeSessionByIdDeps = {
  store: Store;
  client: RuntimeBackendClient;
  sessionId: string;
};

export type ResumeSessionByIdResult = {
  resumed: SessionResumeResult;
  session: SessionSummary;
};

/**
 * Resolves `sessionId` against the durable session list, resumes it into the
 * runtime, and returns both the restored payload and the matched summary.
 *
 * Shared by the `/resume` picker and the `--resume=<id>` boot path so both
 * resolve, relaunch, and restore a session the same way. Throws
 * {@link BootResumeError} when `sessionId` is not a known resumable session, and
 * propagates any backend failure from the resume itself.
 */
export async function resumeSessionById({
  store,
  client,
  sessionId
}: ResumeSessionByIdDeps): Promise<ResumeSessionByIdResult> {
  const { sessions } = await client.listSessions();
  const session = sessions.find((candidate) => candidate.sessionId === sessionId);
  if (session === undefined) {
    throw new BootResumeError(sessionId);
  }
  const resumed = await resumeSessionIntoRuntime({
    store,
    client,
    sessionId,
    workspaceCwd: session.folder
  });
  return { resumed, session };
}
