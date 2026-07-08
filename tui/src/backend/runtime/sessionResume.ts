import type { createStore } from 'jotai';
import type { SessionResumeResult } from '@contracts/backend/index.ts';
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
