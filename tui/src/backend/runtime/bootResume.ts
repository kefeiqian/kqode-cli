import type { createStore } from 'jotai';
import { CLI_NAME } from '@constants/product.ts';
import { hydrateResumedTranscriptAtom } from '@state/promptQueue/atoms.ts';
import type { RuntimeBackendClient } from '@backend/runtime/backendRuntime.ts';
import { BootResumeError, resumeSessionById } from '@backend/runtime/sessionResume.ts';

type Store = ReturnType<typeof createStore>;

export type ApplyBootResumeDeps = {
  store: Store;
  client: RuntimeBackendClient;
  /** The `--resume=<id>` value, or `undefined` when the flag was omitted. */
  resumeSessionId: string | undefined;
  /** Runs before the rethrow on failure so the caller can tear the backend down. */
  onFailure: () => void;
};

/**
 * Reopens the requested session before the first frame renders.
 *
 * No-ops when `resumeSessionId` is omitted (a normal fresh-session launch). A
 * blank id (`--resume=`) is treated as an error, not a silent fresh session. On
 * any failure it runs `onFailure` (backend teardown) and rethrows so the CLI
 * entry can report the error and exit non-zero.
 */
export async function applyBootResume({
  store,
  client,
  resumeSessionId,
  onFailure
}: ApplyBootResumeDeps): Promise<void> {
  if (resumeSessionId === undefined) {
    return;
  }
  const sessionId = resumeSessionId.trim();
  try {
    if (sessionId === '') {
      throw new BootResumeError(resumeSessionId);
    }
    const { resumed } = await resumeSessionById({ store, client, sessionId });
    store.set(hydrateResumedTranscriptAtom, resumed);
  } catch (error) {
    onFailure();
    throw error;
  }
}

/**
 * Builds the shell-facing error line for a failed `--resume=<id>` boot: names the
 * bad id and points at the in-app recovery path, since raw ids are shown nowhere
 * but the exit card.
 */
export function bootResumeErrorMessage(error: BootResumeError): string {
  return `${error.message} Run \`${CLI_NAME}\` and pick a session with /resume.`;
}
